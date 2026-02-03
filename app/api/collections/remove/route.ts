import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Helper to add CORS headers
function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
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

// POST - Remove a collection from user's view
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const body = await request.json()
    const { collectionId } = body

    if (!collectionId) {
      const response = NextResponse.json({ error: 'Collection ID is required' }, { status: 400 })
      return corsHeaders(response)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Check if user owns this collection
    const { data: collection } = await supabase
      .from('collections')
      .select('user_id')
      .eq('id', collectionId)
      .single()

    if (!collection) {
      const response = NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      return corsHeaders(response)
    }

    if (collection.user_id === user.id) {
      // Owner is removing the collection - add to removed_collections
      // This way the collection still exists for others who have access
      const { error: insertError } = await supabase
        .from('removed_collections')
        .insert({
          collection_id: collectionId,
          user_id: user.id
        })

      if (insertError) {
        // If it's a duplicate (unique constraint), that's fine
        if (insertError.code !== '23505') {
          console.error('Error adding to removed_collections:', insertError)
          const response = NextResponse.json({ error: 'Failed to remove collection' }, { status: 500 })
          return corsHeaders(response)
        }
      }
    } else {
      // Non-owner - remove from shared_collections
      const { error: deleteError } = await supabase
        .from('shared_collections')
        .delete()
        .eq('collection_id', collectionId)
        .eq('user_id', user.id)

      if (deleteError) {
        console.error('Error removing from shared_collections:', deleteError)
        const response = NextResponse.json({ error: 'Failed to remove collection' }, { status: 500 })
        return corsHeaders(response)
      }
    }

    const response = NextResponse.json({ success: true })
    return corsHeaders(response)
  } catch (error) {
    console.error('API error:', error)
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response)
  }
}
