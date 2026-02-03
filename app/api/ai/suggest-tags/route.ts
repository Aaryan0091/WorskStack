import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { generateAItags, fuzzyMatchTags, getRandomColor } from '@/lib/ai-tagging'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!
const GROQ_API_KEY = process.env.GROQ_API_KEY!

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
    console.error('Auth error:', error?.message)
    return null
  }

  return data.user
}

// GET - Check AI feature status
export async function GET() {
  const isEnabled = !!GROQ_API_KEY
  return corsHeaders(
    NextResponse.json({
      enabled: isEnabled,
      model: 'llama-3.1-8b-instant',
    })
  )
}

// POST - Generate tag suggestions
export async function POST(request: NextRequest) {
  try {
    // 1. Check if AI is configured
    if (!GROQ_API_KEY) {
      const response = NextResponse.json(
        { error: 'AI tagging is not configured. Please add GROQ_API_KEY.' },
        { status: 503 }
      )
      return corsHeaders(response)
    }

    // 2. Authenticate user
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)
    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    // 3. Parse request body
    const body = await request.json()
    const { url, title, description } = body

    if (!url) {
      const response = NextResponse.json({ error: 'URL is required' }, { status: 400 })
      return corsHeaders(response)
    }

    // 4. Generate AI tags
    const bookmarkTitle = title || new URL(url).hostname
    const aiTags = await generateAItags(bookmarkTitle, url, description || '')

    if (aiTags.length === 0) {
      const response = NextResponse.json({
        suggested: [],
        summary: { total: 0, matched: 0, created: 0 },
      })
      return corsHeaders(response)
    }

    // 5. Fetch user's existing tags
    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
    const { data: existingTags } = await supabase
      .from('tags')
      .select('id, name')
      .eq('user_id', user.id)

    // 6. Perform fuzzy matching
    const { matched, newTags } = fuzzyMatchTags(aiTags, existingTags || [])

    // 7. Create new tags
    const createdTags = []
    for (const tagName of newTags) {
      const { data } = await supabase
        .from('tags')
        .insert({ name: tagName, user_id: user.id, color: getRandomColor() })
        .select()
        .single()

      if (data) createdTags.push(data)
    }

    // 8. Combine results
    const suggestedTags = [
      ...matched.map((m) => ({ ...m.existingTag, isNew: false })),
      ...createdTags.map((t) => ({ ...t, isNew: true })),
    ]

    const response = NextResponse.json({
      suggested: suggestedTags,
      summary: {
        total: suggestedTags.length,
        matched: matched.length,
        created: createdTags.length,
      },
    })
    return corsHeaders(response)
  } catch (error) {
    console.error('AI suggest tags error:', error)
    const response = NextResponse.json(
      { error: 'Failed to generate tag suggestions' },
      { status: 500 }
    )
    return corsHeaders(response)
  }
}
