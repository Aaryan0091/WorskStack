import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cleanupUnusedTags } from '@/lib/ai-tagging'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Add CORS headers
function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, DELETE, PATCH, OPTIONS')
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

// DELETE - Remove a bookmark and cleanup unused tags
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const { id } = await params

    if (!id) {
      const response = NextResponse.json({ error: 'Bookmark ID is required' }, { status: 400 })
      return corsHeaders(response)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Verify the bookmark belongs to the user
    const { data: bookmark } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!bookmark) {
      const response = NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
      return corsHeaders(response)
    }

    // Delete the bookmark (cascade will handle bookmark_tags)
    const { error: deleteError } = await supabase.from('bookmarks').delete().eq('id', id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      const response = NextResponse.json({ error: deleteError.message }, { status: 500 })
      return corsHeaders(response)
    }

    // Cleanup unused tags in background
    cleanupUnusedTags(user.id).catch((err) => console.error('Cleanup error:', err))

    const response = NextResponse.json({ success: true })
    return corsHeaders(response)
  } catch (error) {
    console.error('API error:', error)
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response)
  }
}

// PATCH - Update a bookmark
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const { id } = await params

    if (!id) {
      const response = NextResponse.json({ error: 'Bookmark ID is required' }, { status: 400 })
      return corsHeaders(response)
    }

    const body = await request.json()
    const { url, title, description, notes, folder_id, collection_id, is_read, is_favorite } = body

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Build update object with only provided fields
    const updateData: Record<string, string | boolean | null> = {}
    if (url !== undefined) updateData.url = url
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (notes !== undefined) updateData.notes = notes
    if (folder_id !== undefined) updateData.folder_id = folder_id
    if (collection_id !== undefined) updateData.collection_id = collection_id
    if (is_read !== undefined) updateData.is_read = is_read
    if (is_favorite !== undefined) updateData.is_favorite = is_favorite

    const { data, error } = await supabase
      .from('bookmarks')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Update error:', error)
      const response = NextResponse.json({ error: error.message }, { status: 500 })
      return corsHeaders(response)
    }

    if (!data) {
      const response = NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
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
