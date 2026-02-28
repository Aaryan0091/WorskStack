import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { apiSuccess, withApiHandler, ApiError } from '@/lib/api-response'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
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

// GET - Get shared collection by share_slug
export const GET = withApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const shareSlug = searchParams.get('slug')

  if (!shareSlug) {
    throw new ApiError('Share slug is required', 400, 'INVALID_INPUT')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Get collection by share_slug
  const { data: collection, error } = await supabase
    .from('collections')
    .select('*')
    .eq('share_slug', shareSlug)
    .eq('is_public', true)
    .single()

  if (error || !collection) {
    throw new ApiError('Collection not found or not public', 404, 'NOT_FOUND')
  }

  // Get bookmarks in this collection via junction table
  const { data: collectionBookmarks } = await supabase
    .from('collection_bookmarks')
    .select('bookmark_id')
    .eq('collection_id', collection.id)

  const bookmarkIds = collectionBookmarks?.map((cb: { bookmark_id: string }) => cb.bookmark_id) || []

  let bookmarks = []
  if (bookmarkIds.length > 0) {
    const { data: bookmarksData } = await supabase
      .from('bookmarks')
      .select('*')
      .in('id', bookmarkIds)

    bookmarks = bookmarksData || []
  }

  return corsHeaders(apiSuccess({
    collection: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      created_at: collection.created_at
    },
    bookmarks,
    count: bookmarks.length
  }))
})

// PUT - Update collection sharing settings
export const PUT = withApiHandler(async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
  const authHeader = request.headers.get('Authorization')
  const user = await getUserFromToken(authHeader)

  if (!user) {
    throw new ApiError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  // In Next.js 16, params is a Promise
  const params = await context?.params
  const collectionId = params?.id || ''

  const body = await request.json()
  const { is_public } = body

  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

  // Verify user owns this collection
  const { data: collection } = await supabase
    .from('collections')
    .select('*')
    .eq('id', collectionId)
    .eq('user_id', user.id)
    .single()

  if (!collection) {
    throw new ApiError('Collection not found', 404, 'NOT_FOUND')
  }

  // Update sharing settings
  const updateData: { is_public: boolean; share_slug?: string | null } = { is_public: is_public || false }

  // Generate share_slug if making public and doesn't have one
  if (is_public && !collection.share_slug) {
    const randomSuffix = Math.random().toString(36).substr(2, 9)
    updateData.share_slug = `${collection.name.toLowerCase().replace(/\s+/g, '-')}-${randomSuffix}`
  } else if (!is_public) {
    // Remove share_slug when making private
    updateData.share_slug = null
  }

  const { data, error } = await supabase
    .from('collections')
    .update(updateData)
    .eq('id', collectionId)
    .select()
    .single()

  if (error) {
    throw new ApiError('Failed to update collection', 500, 'INTERNAL_ERROR')
  }

  return corsHeaders(apiSuccess({
    collection: data,
    shareUrl: is_public ? `${request.nextUrl.origin}/shared/${data.share_slug}` : null
  }, 'Collection sharing updated'))
})

// Generate unique share slug
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateShareSlug(name: string): string {
  const normalized = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const randomSuffix = Math.random().toString(36).substr(2, 9)
  return `${normalized}-${randomSuffix}`
}
