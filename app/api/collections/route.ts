import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }))
}

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

// GET - Get all collections or get/create default collection
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const { searchParams } = new URL(request.url)
    const getAll = searchParams.get('all') === 'true'

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // If ?all=true, return all user's collections
    if (getAll) {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        const response = NextResponse.json({ error: error.message }, { status: 500 })
        return corsHeaders(response)
      }

      const response = NextResponse.json({ collections: data || [] })
      return corsHeaders(response)
    }

    // Otherwise, try to find existing default collection
    const { data: existing } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .eq('name', 'My Collection (default)')
      .single()

    if (existing) {
      const response = NextResponse.json({ collection: existing })
      return corsHeaders(response)
    }

    // Create default collection
    const share_slug = 'default-' + Math.random().toString(36).substr(2, 9)

    const { data, error } = await supabase
      .from('collections')
      .insert({
        name: 'My Collection (default)',
        description: 'Your default collection for quick saves',
        is_public: false,
        share_slug,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      const response = NextResponse.json({ error: error.message }, { status: 500 })
      return corsHeaders(response)
    }

    const response = NextResponse.json({ collection: data })
    return corsHeaders(response)
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('API error:', error)
    }
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response)
  }
}

// POST - Add a URL to default collection (creates bookmark + adds to collection)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const body = await request.json()
    const { url, title, description } = body

    if (!url) {
      const response = NextResponse.json({ error: 'URL is required' }, { status: 400 })
      return corsHeaders(response)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Get or create default collection
    let collection = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .eq('name', 'My Collection (default)')
      .single()

    if (!collection.data) {
      const share_slug = 'default-' + Math.random().toString(36).substr(2, 9)
      const newCollection = await supabase
        .from('collections')
        .insert({
          name: 'My Collection (default)',
          description: 'Your default collection for quick saves',
          is_public: false,
          share_slug,
          user_id: user.id,
        })
        .select()
        .single()

      if (newCollection.error) {
        const response = NextResponse.json({ error: newCollection.error.message }, { status: 500 })
        return corsHeaders(response)
      }
      collection = newCollection
    }

    // Check if bookmark already exists
    const { data: existingBookmark } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .eq('url', url)
      .single()

    let bookmark

    if (existingBookmark) {
      // Update existing bookmark to add to collection
      const { data } = await supabase
        .from('bookmarks')
        .update({ collection_id: collection.data.id })
        .eq('id', existingBookmark.id)
        .select()
        .single()
      bookmark = data
    } else {
      // Create new bookmark in the collection
      const { data, error } = await supabase
        .from('bookmarks')
        .insert({
          user_id: user.id,
          url,
          title: title || new URL(url).hostname,
          description: description || null,
          notes: null,
          folder_id: null,
          collection_id: collection.data.id,
          is_read: false,
          is_favorite: false,
        })
        .select()
        .single()

      if (error) {
        const response = NextResponse.json({ error: error.message }, { status: 500 })
        return corsHeaders(response)
      }
      bookmark = data
    }

    const response = NextResponse.json({
      success: true,
      bookmark,
      collection: collection.data,
      message: existingBookmark ? 'Added to collection' : 'Created and added to collection'
    })
    return corsHeaders(response)
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('API error:', error)
    }
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response)
  }
}
