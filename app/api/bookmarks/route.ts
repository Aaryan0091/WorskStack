import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Helper to add CORS headers for extension requests
function corsHeaders(response: NextResponse) {
  // Allow requests from Chrome extensions
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

// Handle OPTIONS preflight request
export async function OPTIONS(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const body = await request.json()
    const { url, title, description, notes, folder_id } = body

    if (!url) {
      const response = NextResponse.json({ error: 'URL is required' }, { status: 400 })
      return corsHeaders(response)
    }

    // Use service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Check if bookmark already exists for this user
    const { data: existing } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('url', url)
      .single()

    if (existing) {
      const response = NextResponse.json({ error: 'Bookmark already exists' }, { status: 409 })
      return corsHeaders(response)
    }

    // Create the bookmark
    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        user_id: user.id,
        url,
        title: title || new URL(url).hostname,
        description: description || null,
        notes: notes || null,
        folder_id: folder_id || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      const response = NextResponse.json({ error: error.message }, { status: 500 })
      return corsHeaders(response)
    }

    const response = NextResponse.json({ success: true, bookmark: data })
    return corsHeaders(response)
  } catch (error) {
    console.error('API error:', error)
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response)
  }
}
