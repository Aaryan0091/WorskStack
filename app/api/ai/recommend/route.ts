import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!
const GROQ_API_KEY = process.env.GROQ_API_KEY!

interface Bookmark {
  id: string
  user_id: string
  url: string
  title?: string
  description?: string | null
  is_read: boolean
  is_favorite: boolean
  created_at: string
}

interface ScoredBookmark extends Bookmark {
  _score: number
}

// Add CORS headers
function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

// Handle OPTIONS preflight request
export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }))
}

// Verify auth token and get user
async function getUserFromToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return null
  }

  return data.user
}

// POST - Get semantically related bookmarks
export async function POST(request: NextRequest) {
  try {
    // Check if AI is configured
    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not set')
      const response = NextResponse.json(
        { recommendations: [] },
        { status: 200 }
      )
      return corsHeaders(response)
    }

    // Authenticate user
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)
    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // 1. Get user's recent reading list items (is_read = false)
    const { data: readingList, error: readingListError } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5)

    if (readingListError) {
      console.error('Reading list fetch error:', readingListError)
      const response = NextResponse.json({ recommendations: [] })
      return corsHeaders(response)
    }

    if (!readingList || readingList.length === 0) {
      const response = NextResponse.json({ recommendations: [] })
      return corsHeaders(response)
    }

    // 2. Build context from reading list
    const contextText = readingList
      .map(b => `Title: ${b.title}\nURL: ${b.url}\nDescription: ${b.description || 'N/A'}`)
      .join('\n\n---\n\n')

    // 3. Use AI to find related topics/terms
    const groq = new Groq({ apiKey: GROQ_API_KEY })

    const prompt = `You are a semantic recommendation engine. Your goal is to understand the TOPICS and THEMES of the user's reading list, then generate search queries that would find RELATED content across ANY domain.

Current Reading List:
${contextText}

CRITICAL GUIDELINES:
1. Return ONLY a JSON object with a "queries" array
2. Think about TOPICS, THEMES, and CONCEPTS - not just exact words
3. Generate 5-8 diverse search queries that would find semantically related content
4. Include: specific entities, broader topics, related technologies, synonyms, and adjacent concepts

SEMANTIC EXPANSION STRATEGY:
- If you see "ChatGPT", also extract: "AI assistant", "language model", "OpenAI", "GPT"
- If you see "React tutorial", also extract: "frontend framework", "JavaScript library", "web development"
- If you see "AI agent", also extract: "autonomous AI", "AI assistant", "AI bot", "agent system"
- If you see "Python script", also extract: "coding", "programming", "development"
- If you see a specific product, also extract: the category, competitors, use cases

EXAMPLES:

Example 1 - AI/Tech content:
Input: "Claude AI Agent Tutorial", "Building AI Agents with LangChain"
Output: { "queries": ["AI agent", "Claude", "LangChain", "autonomous AI", "AI assistant", "language model", "agent framework", "AI development"] }

Example 2 - YouTube/Entertainment:
Input: "dhurandar title track", "shararat song"
Output: { "queries": ["dhurandar", "title track", "shararat", "music", "soundtrack", "bollywood", "song"] }

Example 3 - Development:
Input: "Next.js tutorial", "React best practices"
Output: { "queries": ["Next.js", "React", "frontend", "framework", "JavaScript", "web development", "SSR", "Vercel"] }

IMPORTANT: The goal is to find RELATED content even if it uses different terminology or is on a different website. Think like a human making connections between related topics.

Now extract semantic queries from this reading list:`

    try {
      const aiResponse = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5, // Increased for more creative/semantic associations
        max_tokens: 300, // Increased to allow for more queries
        response_format: { type: 'json_object' },
      })

      const content = aiResponse.choices[0]?.message?.content
      if (!content) {
        const response = NextResponse.json({ recommendations: [] })
        return corsHeaders(response)
      }

      const parsed = JSON.parse(content)
      const queries = parsed.queries || []

      if (queries.length === 0) {
        const response = NextResponse.json({ recommendations: [] })
        return corsHeaders(response)
      }

      // 4. Search for bookmarks matching these queries (excluding current reading list)
      const readingListIds = readingList.map(b => b.id)

      // Get all other bookmarks (filter in JS to avoid Supabase syntax issues)
      const { data: allBookmarks } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', user.id)

      // Filter out reading list items
      const otherBookmarks = (allBookmarks || []).filter((b: Bookmark) => !readingListIds.includes(b.id))

      // Score bookmarks based on query matches with improved semantic matching
      const scoredBookmarks = otherBookmarks.map((bookmark: Bookmark): ScoredBookmark => {
        let score = 0
        const titleLower = (bookmark.title || '').toLowerCase()
        const descLower = (bookmark.description || '').toLowerCase()
        const urlLower = bookmark.url.toLowerCase()
        const titleWords = titleLower.split(/\s+/)
        const descWords = descLower.split(/\s+/)

        for (const query of queries) {
          const queryLower = query.toLowerCase()
          const queryWords = queryLower.split(/\s+/)

          // Exact phrase match (highest score)
          if (titleLower.includes(queryLower)) score += 10
          if (descLower.includes(queryLower)) score += 5
          if (urlLower.includes(queryLower)) score += 2

          // Partial word matching for multi-word queries
          // e.g., "AI agent" should match if title has "AI" or "agent"
          for (const qWord of queryWords) {
            if (qWord.length < 3) continue // Skip very short words

            // Match against individual words
            if (titleWords.some(w => w.includes(qWord) || qWord.includes(w))) score += 3
            if (descWords.some(w => w.includes(qWord) || qWord.includes(w))) score += 1
          }
        }

        return { ...bookmark, _score: score }
      })

      // Filter and sort by score - return up to 12 recommendations
      const recommendations = scoredBookmarks
        .filter((b: ScoredBookmark) => b._score > 0)
        .sort((a: ScoredBookmark, b: ScoredBookmark) => b._score - a._score)
        .slice(0, 12)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ _score, ...bookmark }) => bookmark)

      const response = NextResponse.json({
        recommendations,
        queries,
        count: recommendations.length,
      })
      return corsHeaders(response)
    } catch (aiError) {
      console.error('AI recommendation error:', aiError)
      // Return empty recommendations on AI error instead of failing
      const response = NextResponse.json({ recommendations: [] })
      return corsHeaders(response)
    }
  } catch (error) {
    console.error('Recommendation API error:', error)
    const response = NextResponse.json(
      { recommendations: [] },
      { status: 200 }
    )
    return corsHeaders(response)
  }
}
