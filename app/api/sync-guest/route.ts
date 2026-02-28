import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Bookmark, Collection } from '@/lib/types'

// Guest data types (from localStorage, may not have all fields)
interface GuestBookmark {
  id: string
  user_id?: string
  url: string
  title: string
  description?: string | null
  notes?: string | null
  is_read?: boolean
  is_favorite?: boolean
  collection_id?: string | null
  [key: string]: unknown
}

interface GuestCollection {
  id: string
  user_id?: string
  name: string
  description?: string | null
  is_public?: boolean
  share_slug?: string | null
  [key: string]: unknown
}

// Simple validation helpers
function isValidGuestBookmark(item: unknown): item is GuestBookmark {
  if (!item || typeof item !== 'object') return false

  const bookmark = item as Record<string, unknown>
  return (
    typeof bookmark.url === 'string' &&
    typeof bookmark.title === 'string' &&
    bookmark.url.length > 0 &&
    bookmark.url.length <= 2048 &&
    bookmark.title.length > 0 &&
    bookmark.title.length <= 500
  )
}

function isValidGuestCollection(item: unknown): item is GuestCollection {
  if (!item || typeof item !== 'object') return false

  const collection = item as Record<string, unknown>
  return (
    typeof collection.name === 'string' &&
    collection.name.length > 0 &&
    collection.name.length <= 200
  )
}

export async function POST(request: NextRequest) {
  try {
    const { guestBookmarks, guestCollections } = await request.json()

    // Validate input structure
    if (guestBookmarks && !Array.isArray(guestBookmarks)) {
      return NextResponse.json({ error: 'Invalid guestBookmarks format' }, { status: 400 })
    }
    if (guestCollections && !Array.isArray(guestCollections)) {
      return NextResponse.json({ error: 'Invalid guestCollections format' }, { status: 400 })
    }

    // Validate bookmark data structure
    if (guestBookmarks && Array.isArray(guestBookmarks)) {
      for (let i = 0; i < guestBookmarks.length; i++) {
        if (!isValidGuestBookmark(guestBookmarks[i])) {
          return NextResponse.json(
            { error: `Invalid bookmark at index ${i}` },
            { status: 400 }
          )
        }
      }
    }

    // Validate collection data structure
    if (guestCollections && Array.isArray(guestCollections)) {
      for (let i = 0; i < guestCollections.length; i++) {
        if (!isValidGuestCollection(guestCollections[i])) {
          return NextResponse.json(
            { error: `Invalid collection at index ${i}` },
            { status: 400 }
          )
        }
      }
    }

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const syncedBookmarks: string[] = []
    const syncedCollections: Record<string, string> = {} // guest_id -> real_id mapping

    // First, sync collections (if any)
    if (guestCollections && Array.isArray(guestCollections) && guestCollections.length > 0) {
      for (const guestCollection of guestCollections) {
        // Skip collections that were already synced (have a non-empty user_id)
        if (guestCollection.user_id) continue

        const { data: newCollection } = await supabase
          .from('collections')
          .insert({
            user_id: user.id,
            name: guestCollection.name,
            description: guestCollection.description,
            is_public: guestCollection.is_public ?? false,
            share_slug: guestCollection.share_slug,
          })
          .select()
          .single()

        if (newCollection) {
          syncedCollections[guestCollection.id] = newCollection.id
        }
      }
    }

    // Then, sync bookmarks
    if (guestBookmarks && Array.isArray(guestBookmarks) && guestBookmarks.length > 0) {
      for (const guestBookmark of guestBookmarks) {
        // Skip bookmarks that were already synced (have a non-empty user_id)
        if (guestBookmark.user_id) continue

        // Map the collection_id if it was synced
        const collectionId = guestBookmark.collection_id && syncedCollections[guestBookmark.collection_id]
          ? syncedCollections[guestBookmark.collection_id]
          : null

        const { data: newBookmark } = await supabase
          .from('bookmarks')
          .insert({
            user_id: user.id,
            url: guestBookmark.url,
            title: guestBookmark.title,
            description: guestBookmark.description,
            notes: guestBookmark.notes,
            is_read: guestBookmark.is_read ?? true,
            is_favorite: guestBookmark.is_favorite ?? false,
            collection_id: collectionId,
          })
          .select()
          .single()

        if (newBookmark) {
          syncedBookmarks.push(newBookmark.id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      synced: {
        bookmarks: syncedBookmarks.length,
        collections: Object.keys(syncedCollections).length,
      }
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Sync error:', error)
    }
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

