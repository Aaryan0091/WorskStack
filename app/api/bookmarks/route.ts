import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import {
  apiSuccess,
  withApiHandler,
  ApiError,
  validateRequired,
  isValidUrl,
  getUserFromToken,
  corsHeaders,
  handleOptionsRequest
} from '@/lib/api-response'

// Validate required environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
}

const GROQ_API_KEY = process.env.GROQ_API_KEY

// Handle OPTIONS preflight request
export async function OPTIONS(request: NextRequest) {
  return handleOptionsRequest(request)
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const authHeader = request.headers.get('Authorization')
  const user = await getUserFromToken(authHeader)

  if (!user) {
    throw new ApiError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  const body = await request.json()
  const { url, title, description, notes, folder_id, collection_id } = body

  // Validate required fields
  const validationError = validateRequired(body, ['url'])
  if (validationError) {
    throw new ApiError(validationError, 400, 'INVALID_INPUT')
  }

  // Validate URL format
  if (!isValidUrl(url)) {
    throw new ApiError('Invalid URL format', 400, 'INVALID_INPUT')
  }

  // Sanitize inputs
  const sanitizedTitle = title?.trim() || ''
  const sanitizedDescription = description?.trim() || ''
  const sanitizedNotes = notes?.trim() || ''

  // Use service role key to bypass RLS, fallback to anon key if service key not available
  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

  // Check if bookmark already exists for this user
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('url', url)
    .single()

  if (existing) {
    // If adding to a collection, add via junction table
    if (collection_id) {
      // Check if already in collection
      const { data: existingInCollection } = await supabase
        .from('collection_bookmarks')
        .select('bookmark_id')
        .eq('collection_id', collection_id)
        .eq('bookmark_id', existing.id)
        .single()

      if (!existingInCollection) {
        await supabase
          .from('collection_bookmarks')
          .insert({ collection_id, bookmark_id: existing.id })
      }

      const { data: updated } = await supabase
        .from('bookmarks')
        .select()
        .eq('id', existing.id)
        .single()

      return corsHeaders(apiSuccess({ bookmark: updated, updated: true }, 'Bookmark already exists, added to collection'), request)
    }

    throw new ApiError('Bookmark already exists', 409, 'DUPLICATE')
  }

  // Create the bookmark
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      url,
      title: sanitizedTitle || new URL(url).hostname,
      description: sanitizedDescription || null,
      notes: sanitizedNotes || null,
      folder_id: folder_id || null,
      is_read: true,
      is_favorite: false,
    })
    .select()
    .single()

  if (error) {
    throw new ApiError('Failed to create bookmark', 500, 'INTERNAL_ERROR')
  }

  // Trigger AI auto-tagging in background (fire and forget)
  if (GROQ_API_KEY && data?.id) {
    // Auto-detect base URL from request (works in both dev and production)
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`
    // Don't await - let it run in background
    fetch(`${baseUrl}/api/ai/auto-tag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || '',
      },
      body: JSON.stringify({ bookmark_id: data.id }),
    }).catch((err) => {
      // Silently fail for background task
      if (process.env.NODE_ENV === 'development') {
        console.error('Background auto-tag failed:', err)
      }
    })
  }

  // If collection_id is provided, add to collection via junction table
  if (collection_id && data?.id) {
    try {
      await supabase
        .from('collection_bookmarks')
        .insert({ collection_id, bookmark_id: data.id })
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to add to collection:', err)
      }
    }
  }

  return corsHeaders(apiSuccess({ bookmark: data }, 'Bookmark created successfully', 201), request)
})
