import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { applyAiTagsToBookmark } from '@/lib/ai-tagging'

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
    return null
  }

  return data.user
}

// POST - Auto-tag a bookmark (runs in background)
export async function POST(request: NextRequest) {
  try {
    // 1. Check if AI is configured
    if (!GROQ_API_KEY) {
      const response = NextResponse.json(
        { error: 'AI tagging is not configured' },
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
    const { bookmark_id } = body

    if (!bookmark_id) {
      const response = NextResponse.json(
        { error: 'bookmark_id is required' },
        { status: 400 }
      )
      return corsHeaders(response)
    }

    // 4. Fetch the bookmark
    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
    const { data: bookmark, error: fetchError } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('id', bookmark_id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !bookmark) {
      const response = NextResponse.json(
        { error: 'Bookmark not found' },
        { status: 404 }
      )
      return corsHeaders(response)
    }

    // 5. Apply AI tags (this creates tags and associates them)
    const suggestions = await applyAiTagsToBookmark(
      user.id,
      bookmark_id,
      bookmark.title,
      bookmark.url,
      bookmark.description || ''
    )

    const response = NextResponse.json({
      success: true,
      tags: suggestions,
      count: suggestions.length,
    })
    return corsHeaders(response)
  } catch (error) {
    console.error('AI auto-tag error:', error)
    const response = NextResponse.json(
      { error: 'Failed to auto-tag bookmark' },
      { status: 500 }
    )
    return corsHeaders(response)
  }
}
