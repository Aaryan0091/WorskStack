import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { ENV, corsHeaders, handleOptionsRequest } from '@/lib/api-response'

const supabaseUrl = ENV.SUPABASE_URL
const supabaseAnonKey = ENV.SUPABASE_ANON_KEY
const supabaseServiceKey = ENV.SUPABASE_SERVICE_KEY
export async function OPTIONS(request: NextRequest) {
  return handleOptionsRequest(request)
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
      return corsHeaders(response, request)
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
        return corsHeaders(response, request)
      }

      const response = NextResponse.json({ collections: data || [] })
      return corsHeaders(response, request)
    }

    // Otherwise, try to find existing default collection
    const { data: existing, error: findError } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', 'My Collection (default)')
      .limit(1)
      .single()

    if (existing) {
      const response = NextResponse.json({ collection: existing })
      return corsHeaders(response, request)
    }

    // If we get a "PGRST116" error (no rows returned), we can proceed to create
    // Otherwise, return the error
    if (findError && findError.code !== 'PGRST116') {
      const response = NextResponse.json({ error: findError.message }, { status: 500 })
      return corsHeaders(response, request)
    }

    // Create default collection
    const share_slug = 'default-' + Math.random().toString(36).substr(2, 9)
    const share_code = Math.random().toString(36).substring(2, 10)

    const { data, error } = await supabase
      .from('collections')
      .insert({
        name: 'My Collection (default)',
        description: 'Your default collection for quick saves',
        is_public: false,
        share_slug,
        share_code,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      const response = NextResponse.json({ error: error.message }, { status: 500 })
      return corsHeaders(response, request)
    }

    const response = NextResponse.json({ collection: data })
    return corsHeaders(response, request)
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('API error:', error)
    }
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response, request)
  }
}

// POST - Add a URL to default collection (creates bookmark + adds to collection)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response, request)
    }

    const body = await request.json()
    const { url, title, description } = body

    if (!url) {
      const response = NextResponse.json({ error: 'URL is required' }, { status: 400 })
      return corsHeaders(response, request)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Get or create default collection
    let collection = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', 'My Collection (default)')
      .limit(1)
      .single()

    if (!collection.data) {
      const share_slug = 'default-' + Math.random().toString(36).substr(2, 9)
      const share_code = Math.random().toString(36).substring(2, 10)
      const newCollection = await supabase
        .from('collections')
        .insert({
          name: 'My Collection (default)',
          description: 'Your default collection for quick saves',
          is_public: false,
          share_slug,
          share_code,
          user_id: user.id,
        })
        .select()
        .single()

      if (newCollection.error) {
        // If it's a duplicate error, try to fetch the existing collection
        const errorMsg = newCollection.error.message.toLowerCase()
        if (errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
          // Collection was created by another request, fetch it
          const refetched = await supabase
            .from('collections')
            .select('*')
            .eq('user_id', user.id)
            .ilike('name', 'My Collection (default)')
            .limit(1)
            .single()

          if (refetched.data) {
            collection = refetched
          } else {
            const response = NextResponse.json({ error: newCollection.error.message }, { status: 500 })
            return corsHeaders(response, request)
          }
        } else {
          const response = NextResponse.json({ error: newCollection.error.message }, { status: 500 })
          return corsHeaders(response, request)
        }
      } else {
        collection = newCollection
      }
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
        return corsHeaders(response, request)
      }
      bookmark = data
    }

    const response = NextResponse.json({
      success: true,
      bookmark,
      collection: collection.data,
      message: existingBookmark ? 'Added to collection' : 'Created and added to collection'
    })
    return corsHeaders(response, request)
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('API error:', error)
    }
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response, request)
  }
}
