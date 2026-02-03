import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { expandSearchQuery } from '@/lib/ai-tagging'

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
  bookmark_tags?: Array<{ tags?: { name?: string } }>
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

// POST - Semantic search using AI
export async function POST(request: NextRequest) {
  try {
    // Check if AI is configured
    if (!GROQ_API_KEY) {
      const response = NextResponse.json(
        { error: 'AI search is not configured' },
        { status: 503 }
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

    const body = await request.json()
    const { query, collection_id } = body

    if (!query || query.trim().length === 0) {
      const response = NextResponse.json({ error: 'Query is required' }, { status: 400 })
      return corsHeaders(response)
    }

    // 1. Expand query using AI
    const expandedTerms = await expandSearchQuery(query.trim())

    // 2. Build search query for Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Search in bookmarks with tags
    let queryBuilder = supabase
      .from('bookmarks')
      .select(`
        *,
        bookmark_tags (
          tags (*)
        )
      `)
      .eq('user_id', user.id)

    // Filter by collection if provided
    if (collection_id) {
      queryBuilder = queryBuilder.eq('collection_id', collection_id)
    }

    // Get all bookmarks for the user
    const { data: bookmarks, error } = await queryBuilder

    if (error) {
      console.error('Search error:', error)
      const response = NextResponse.json({ error: error.message }, { status: 500 })
      return corsHeaders(response)
    }

    // 3. Score and rank bookmarks based on expanded terms
    const scoredBookmarks = (bookmarks || []).map((bookmark: Bookmark): ScoredBookmark => {
      let score = 0
      const searchLower = query.toLowerCase()
      const titleLower = (bookmark.title || '').toLowerCase()
      const descLower = (bookmark.description || '').toLowerCase()
      const urlLower = bookmark.url.toLowerCase()

      // Get all tag names
      const tagNames = (bookmark.bookmark_tags || []).map((bt) => bt.tags?.name).filter(Boolean) as string[]

      // Direct query matches (highest weight)
      if (titleLower.includes(searchLower)) score += 10
      if (descLower.includes(searchLower)) score += 5
      if (urlLower.includes(searchLower)) score += 3

      // Expanded term matches
      for (const term of expandedTerms.slice(1)) {
        // Skip the first term as it's the original query
        const termLower = term.toLowerCase()
        if (titleLower.includes(termLower)) score += 4
        if (descLower.includes(termLower)) score += 2
        if (urlLower.includes(termLower)) score += 1
        if (tagNames.some((tn) => tn.toLowerCase().includes(termLower))) score += 3
      }

      // Tag matches
      for (const tagName of tagNames) {
        const tagLower = tagName.toLowerCase()
        if (tagLower.includes(searchLower)) score += 6
        if (searchLower.includes(tagLower)) score += 4
      }

      return { ...bookmark, _score: score }
    })

    // 4. Filter out zero-score results and sort by score
    const results = scoredBookmarks
      .filter((b: ScoredBookmark) => b._score > 0)
      .sort((a: ScoredBookmark, b: ScoredBookmark) => b._score - a._score)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ _score, ...bookmark }) => bookmark)

    const response = NextResponse.json({
      results,
      query,
      expandedTerms,
      count: results.length,
    })
    return corsHeaders(response)
  } catch (error) {
    console.error('Semantic search error:', error)
    const response = NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
    return corsHeaders(response)
  }
}
