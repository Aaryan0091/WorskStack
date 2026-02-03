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

// POST - Add a shared collection by code or ID
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const user = await getUserFromToken(authHeader)

    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return corsHeaders(response)
    }

    const body = await request.json()
    const { code } = body

    if (!code) {
      const response = NextResponse.json({ error: 'Collection code is required' }, { status: 400 })
      return corsHeaders(response)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Try to find the collection by share_code or id or share_slug
    let collection = null

    // First try by share_code
    const { data: collectionByCode } = await supabase
      .from('collections')
      .select('*')
      .eq('share_code', code)
      .single()

    if (collectionByCode) {
      collection = collectionByCode
    } else {
      // Try by id
      const { data: collectionById } = await supabase
        .from('collections')
        .select('*')
        .eq('id', code)
        .single()

      if (collectionById) {
        collection = collectionById
      } else {
        // Try by share_slug
        const { data: collectionBySlug } = await supabase
          .from('collections')
          .select('*')
          .eq('share_slug', code)
          .single()

        if (collectionBySlug) {
          collection = collectionBySlug
        }
      }
    }

    if (!collection) {
      const response = NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      return corsHeaders(response)
    }

    // Check if user already has access to this collection
    const { data: existingAccess } = await supabase
      .from('shared_collections')
      .select('*')
      .eq('collection_id', collection.id)
      .eq('user_id', user.id)
      .single()

    if (existingAccess) {
      const response = NextResponse.json({
        message: 'You already have access to this collection',
        collection,
        role: existingAccess.role
      })
      return corsHeaders(response)
    }

    // Determine role based on collection's is_public setting
    // If public: users become editors (can edit)
    // If private: users become viewers (read-only)
    const role = collection.is_public ? 'editor' : 'viewer'

    // Add user to shared_collections
    const { data: sharedCollection, error: shareError } = await supabase
      .from('shared_collections')
      .insert({
        collection_id: collection.id,
        user_id: user.id,
        role
      })
      .select()
      .single()

    if (shareError) {
      console.error('Error adding shared collection:', shareError)
      const response = NextResponse.json({ error: 'Failed to add collection' }, { status: 500 })
      return corsHeaders(response)
    }

    const response = NextResponse.json({
      message: 'Collection added successfully',
      collection,
      role,
      sharedCollection
    })
    return corsHeaders(response)
  } catch (error) {
    console.error('API error:', error)
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return corsHeaders(response)
  }
}
