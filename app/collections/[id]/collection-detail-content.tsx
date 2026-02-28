'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import type { Bookmark, Collection } from '@/lib/types'
import {
  guestStoreGet,
  guestStoreSet,
  GUEST_KEYS,
  markGuestMode
} from '@/lib/guest-storage'

interface Props {
  collectionId: string
}

interface CollectionBookmark extends Bookmark {
  added_by?: string | null
}

export function CollectionDetailContent({ collectionId }: Props) {
  const router = useRouter()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [bookmarks, setBookmarks] = useState<CollectionBookmark[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false) // Start with loading=false for instant render
  const [actionLoading, setActionLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editFormData, setEditFormData] = useState({ name: '', description: '', is_public: false })
  const [formData, setFormData] = useState({ url: '', title: '' })
  const [formError, setFormError] = useState('')
  const [availableBookmarks, setAvailableBookmarks] = useState<Bookmark[]>([])
  const [availableBookmarksLoading, setAvailableBookmarksLoading] = useState(false)
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState('')
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('')
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [visibilityConfirmModalOpen, setVisibilityConfirmModalOpen] = useState(false)
  const [pendingVisibilityChange, setPendingVisibilityChange] = useState<boolean | null>(null)
  const [showNewBookmarkForm, setShowNewBookmarkForm] = useState(false)
  const [newBookmarkUrl, setNewBookmarkUrl] = useState('')
  const [newBookmarkTitle, setNewBookmarkTitle] = useState('')
  const [bookmarkFilterType, setBookmarkFilterType] = useState<'all' | 'favorites' | 'reading-list'>('all')

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId])

  // Real-time subscription for collection_bookmarks changes
  useEffect(() => {
    const channel = supabase
      .channel('collection_bookmarks_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'collection_bookmarks',
          filter: `collection_id=eq.${collectionId}`
        },
        () => {
          // Refresh data when any change happens to this collection's bookmarks
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId])

  // Fetch available bookmarks when modal opens
  useEffect(() => {
    if (addModalOpen) {
      fetchAvailableBookmarks()
      setFormError('')
      setBookmarkSearchQuery('') // Reset search
      setShowNewBookmarkForm(false)
      setNewBookmarkUrl('')
      setNewBookmarkTitle('')
      setSelectedBookmarkIds(new Set())
      setBookmarkFilterType('all')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addModalOpen])

  const fetchAvailableBookmarks = async () => {
    setAvailableBookmarksLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAvailableBookmarksLoading(false)
      return
    }

    // Fetch bookmarks that are already in this collection via junction table
    const { data: existingInCollection } = await supabase
      .from('collection_bookmarks')
      .select('bookmark_id')
      .eq('collection_id', collectionId)

    const existingIds = new Set(existingInCollection?.map((c: { bookmark_id: string }) => c.bookmark_id) || [])

    // Fetch all user's bookmarks, then filter out the ones already in this collection
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('title', { ascending: true })

    // Filter out bookmarks already in this collection
    const available = (data || []).filter((b: Bookmark) => !existingIds.has(b.id))
    setAvailableBookmarks(available)
    setAvailableBookmarksLoading(false)
  }

  const addExistingToCollection = async (bookmark: Bookmark) => {
    setActionLoading(true)

    // Get current user for added_by field
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setActionLoading(false)
      return
    }

    // Add to collection via junction table
    const { error } = await supabase
      .from('collection_bookmarks')
      .insert({
        collection_id: collectionId,
        bookmark_id: bookmark.id,
        added_by: user.id
      })

    if (error) {
      console.error('Failed to add bookmark to collection:', error)
      setActionLoading(false)
      return
    }

    // Refresh data to ensure consistency
    await fetchData()

    setAddModalOpen(false)
    setActionLoading(false)
  }

  const addToCollection = async (bookmarkIds: Set<string>, collectionIdToAdd: string) => {
    setActionLoading(true)

    // Get current user for added_by field
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setActionLoading(false)
      return
    }

    try {
      // Add all selected bookmarks to collection via junction table
      const insertResults = await Promise.allSettled(
        Array.from(bookmarkIds).map(bookmarkId =>
          supabase
            .from('collection_bookmarks')
            .insert({
              collection_id: collectionIdToAdd,
              bookmark_id: bookmarkId,
              added_by: user.id
            })
            .select()
            .single()
        )
      )

      // Check for any failed inserts
      const failures = insertResults.filter(r => r.status === 'rejected')
      if (failures.length > 0) {
        console.error('Some bookmarks failed to add:', failures)
      }

      // Refresh data
      await fetchData()
      await fetchAvailableBookmarks()

      setSelectedBookmarkIds(new Set())
      setAddModalOpen(false)
    } catch (error) {
      console.error('Error adding bookmarks to collection:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const createAndAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!newBookmarkUrl.trim()) {
      setFormError('URL is required')
      return
    }

    try {
      new URL(newBookmarkUrl)
    } catch {
      setFormError('Invalid URL')
      return
    }

    setActionLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Check if a bookmark with this URL already exists in this collection
    const { data: existingBookmark } = await supabase
      .from('collection_bookmarks')
      .select('bookmark_id, bookmarks!inner(url)')
      .eq('collection_id', collectionId)
      .limit(1)

    const existingUrlInCollection = existingBookmark?.find((cb: { bookmark_id: string; bookmarks: { url: string }[] }) => cb.bookmarks?.[0]?.url === newBookmarkUrl)
    if (existingUrlInCollection) {
      setActionLoading(false)
      setFormError('This URL is already in this collection')
      return
    }

    // Create new bookmark with is_read: true so it doesn't appear in reading list
    const { data } = await supabase
      .from('bookmarks')
      .insert({
        user_id: user.id,
        url: newBookmarkUrl,
        title: newBookmarkTitle || new URL(newBookmarkUrl).hostname,
        is_read: true,
        is_favorite: false,
      })
      .select()
      .single()

    if (!data) {
      setActionLoading(false)
      setFormError('Failed to create bookmark')
      return
    }

    // Add to collection via junction table
    const { error } = await supabase
      .from('collection_bookmarks')
      .insert({
        collection_id: collectionId,
        bookmark_id: data.id,
        added_by: user.id
      })

    if (error) {
      setActionLoading(false)
      setFormError('Failed to add to collection')
      return
    }

    // Refresh data
    await fetchData()
    await fetchAvailableBookmarks()

    setNewBookmarkUrl('')
    setNewBookmarkTitle('')
    setShowNewBookmarkForm(false)
    setAddModalOpen(false)
    setActionLoading(false)
  }

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  const fetchData = async () => {
    // Get current user first to check auth
    const { data: { user } } = await supabase.auth.getUser()

    // Guest mode handling - load from localStorage
    if (!user) {
      markGuestMode()
      try {
        const storedCollections = guestStoreGet<Collection[]>(GUEST_KEYS.COLLECTIONS)
        const storedBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)

        if (storedCollections) {
          const collection = storedCollections.find((c: Collection) => c.id === collectionId)
          if (collection) {
            setCollection(collection)
            // Get bookmarks for this collection from guest storage
            const collectionBookmarks = storedBookmarks?.filter((b: Bookmark) => b.collection_id === collectionId) || []
            setBookmarks(collectionBookmarks)
            setLoading(false)
            return
          }
        }
        // Collection not found - redirect to collections
        router.push('/collections')
      } catch (e) {
        console.error('Error loading guest collection:', e)
      }
      setLoading(false)
      return
    }

    // Logged in user - fetch from Supabase
    setCurrentUserId(user.id)

    // Fetch collection and bookmarks in parallel
    const [collectionRes, junctionRes] = await Promise.all([
      supabase.from('collections').select('*').eq('id', collectionId).single(),
      supabase
        .from('collection_bookmarks')
        .select('bookmark_id, bookmarks(*), added_by')
        .eq('collection_id', collectionId),
    ])

    const newCollection = collectionRes.data

    // Extract bookmarks from junction table result with added_by info
    let newBookmarks: CollectionBookmark[] = []
    const orphanedIds: string[] = []

    ;(junctionRes.data || []).forEach((jb: { bookmarks: CollectionBookmark[] | null; added_by: string; bookmark_id: string }) => {
      if (jb.bookmarks && jb.bookmarks.length > 0) {
        newBookmarks.push({
          ...jb.bookmarks[0],
          added_by: jb.added_by
        })
      } else {
        // Bookmark was deleted but junction entry still exists - track orphaned
        orphanedIds.push(jb.bookmark_id)
      }
    })

    // Clean up orphaned entries if user is the owner
    if (newCollection && user?.id === newCollection.user_id && orphanedIds.length > 0) {
      await supabase
        .from('collection_bookmarks')
        .delete()
        .eq('collection_id', collectionId)
        .in('bookmark_id', orphanedIds)
    }

    // If not the owner, filter out bookmarks the user has removed from their view
    if (newCollection && user?.id !== newCollection.user_id) {
      const { data: removedBookmarks } = await supabase
        .from('removed_collection_bookmarks')
        .select('bookmark_id')
        .eq('collection_id', collectionId)
        .eq('user_id', user!.id)

      const removedIds = new Set(removedBookmarks?.map((rb: { bookmark_id: string }) => rb.bookmark_id) || [])
      newBookmarks = newBookmarks.filter((b: CollectionBookmark) => !removedIds.has(b.id))
    }

    // Fetch user names for all unique added_by user IDs
    const uniqueAddedBy = Array.from(new Set(
      newBookmarks
        .map(b => b.added_by)
        .filter(Boolean)
    ))

    if (uniqueAddedBy.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', uniqueAddedBy)

      if (profiles) {
        const namesMap: Record<string, string> = {}
        profiles.forEach((profile: { id: string; full_name?: string | null; email?: string | null }) => {
          namesMap[profile.id] = profile.full_name || profile.email?.split('@')[0] || 'Unknown User'
        })
        setUserNames(namesMap)
      }
    }

    if (newCollection) {
      setCollection(newCollection)
    }
    setBookmarks(newBookmarks)
    setLoading(false)
  }

  const addBookmark = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!formData.url.trim()) {
      setFormError('URL is required')
      return
    }

    try {
      new URL(formData.url) // Validate URL
    } catch {
      setFormError('Invalid URL')
      return
    }

    setActionLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Check if bookmark already exists globally
    const { data: existingBookmark } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .eq('url', formData.url)
      .single()

    let newBookmark

    if (existingBookmark) {
      // Check if already in this collection
      const { data: existingRelation } = await supabase
        .from('collection_bookmarks')
        .select('*')
        .eq('collection_id', collectionId)
        .eq('bookmark_id', existingBookmark.id)
        .single()

      if (existingRelation) {
        setActionLoading(false)
        setFormError('This bookmark is already in this collection')
        return
      }

      // Add to collection via junction table
      const { error } = await supabase
        .from('collection_bookmarks')
        .insert({
          collection_id: collectionId,
          bookmark_id: existingBookmark.id,
          added_by: user.id
        })

      if (error) {
        setActionLoading(false)
        setFormError('Failed to add to collection')
        return
      }

      newBookmark = existingBookmark
    } else {
      // Create new bookmark
      const { data } = await supabase
        .from('bookmarks')
        .insert({
          user_id: user.id,
          url: formData.url,
          title: formData.title || new URL(formData.url).hostname,
          is_read: false,
          is_favorite: false,
        })
        .select()
        .single()

      if (!data) {
        setActionLoading(false)
        setFormError('Failed to create bookmark')
        return
      }

      // Add to collection via junction table
      const { error } = await supabase
        .from('collection_bookmarks')
        .insert({
          collection_id: collectionId,
          bookmark_id: data.id,
          added_by: user.id
        })

      if (error) {
        setActionLoading(false)
        setFormError('Failed to add to collection')
        return
      }

      newBookmark = data
    }

    if (newBookmark) {
      setBookmarks([newBookmark, ...bookmarks])
    }

    setFormData({ url: '', title: '' })
    setAddModalOpen(false)
    setActionLoading(false)
  }

  const removeFromCollection = async (bookmarkId: string) => {
    setActionLoading(true)

    // Ensure we have the current user ID
    let userId = currentUserId
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setActionLoading(false)
        return
      }
      userId = user.id
      setCurrentUserId(user.id)
    }

    // Check if user is owner
    const isOwner = collection?.user_id === userId

    if (isOwner) {
      // Owner: actually delete from collection_bookmarks (removes for everyone)
      await supabase
        .from('collection_bookmarks')
        .delete()
        .eq('collection_id', collectionId)
        .eq('bookmark_id', bookmarkId)

      // Refresh data
      await fetchData()
    } else {
      // Non-owner: add to removed_collection_bookmarks (only hides from their view)
      const { error } = await supabase
        .from('removed_collection_bookmarks')
        .insert({
          collection_id: collectionId,
          bookmark_id: bookmarkId,
          user_id: userId
        })

      if (error) {
        console.error('Failed to mark bookmark as removed:', error)
        setActionLoading(false)
        return
      }

      // Optimistically update UI
      const updatedBookmarks = bookmarks.filter(b => b.id !== bookmarkId)
      setBookmarks(updatedBookmarks)
    }

    setActionLoading(false)
  }

  const toggleFavorite = async (bookmarkId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus

    // Optimistically update UI immediately
    const updatedBookmarks = bookmarks.map(b =>
      b.id === bookmarkId ? { ...b, is_favorite: newStatus } : b
    )
    setBookmarks(updatedBookmarks)

    // Update in background - no user check needed, favorites are per-bookmark
    await supabase
      .from('bookmarks')
      .update({ is_favorite: newStatus })
      .eq('id', bookmarkId)
  }

  const openDeleteModal = () => {
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!collection) return

    setActionLoading(true)
    await supabase.from('collections').delete().eq('id', collection.id)
    setDeleteModalOpen(false)
    setActionLoading(false)
    router.push('/collections')
  }

  const togglePublic = () => {
    if (!collection) return

    // Show confirmation modal instead of directly toggling
    const newStatus = !collection.is_public
    setPendingVisibilityChange(newStatus)
    setVisibilityConfirmModalOpen(true)
  }

  const openEditModal = () => {
    if (!collection) return
    setEditFormData({
      name: collection.name,
      description: collection.description || '',
      is_public: collection.is_public
    })
    setEditModalOpen(true)
  }

  const updateCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collection) return

    // Check if visibility (is_public) is changing
    const isVisibilityChanging = editFormData.is_public !== collection.is_public

    if (isVisibilityChanging) {
      // Show confirmation modal
      setPendingVisibilityChange(editFormData.is_public)
      setVisibilityConfirmModalOpen(true)
      return
    }

    // No visibility change, proceed with update (from edit modal)
    await performUpdate(true)
  }

  const performUpdate = async (fromEditModal = false) => {
    if (!collection) return

    const { data } = await supabase
      .from('collections')
      .update({
        name: fromEditModal ? editFormData.name : collection.name,
        description: fromEditModal ? (editFormData.description || null) : collection.description,
        is_public: pendingVisibilityChange ?? collection.is_public,
      })
      .eq('id', collection.id)
      .select()
      .single()

    if (data) {
      setCollection(data)
      if (fromEditModal) {
        setEditModalOpen(false)
      }
    }
    setVisibilityConfirmModalOpen(false)
    setPendingVisibilityChange(null)
  }

  const confirmVisibilityChange = async () => {
    if (!collection || pendingVisibilityChange === null) return

    // Check if we're coming from edit modal or quick toggle
    const fromEditModal = editModalOpen

    if (fromEditModal) {
      // From edit modal - update all fields
      const originalIsPublic = editFormData.is_public
      editFormData.is_public = pendingVisibilityChange
      await performUpdate(true)
      editFormData.is_public = originalIsPublic
    } else {
      // From quick toggle button - only update visibility
      await performUpdate(false)
    }
  }

  const cancelVisibilityChange = () => {
    setVisibilityConfirmModalOpen(false)
    setPendingVisibilityChange(null)
  }

  // Filter bookmarks by search query
  const filteredBookmarks = collectionSearchQuery
    ? bookmarks.filter(b =>
        b.title?.toLowerCase().includes(collectionSearchQuery.toLowerCase()) ||
        b.url?.toLowerCase().includes(collectionSearchQuery.toLowerCase()) ||
        b.description?.toLowerCase().includes(collectionSearchQuery.toLowerCase())
      )
    : bookmarks

  const toggleBookmarkSelection = (bookmarkId: string) => {
    const newSelection = new Set(selectedBookmarkIds)
    if (newSelection.has(bookmarkId)) {
      newSelection.delete(bookmarkId)
    } else {
      newSelection.add(bookmarkId)
    }
    setSelectedBookmarkIds(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedBookmarkIds.size === bookmarks.length) {
      // Deselect all
      setSelectedBookmarkIds(new Set())
    } else {
      // Select all
      setSelectedBookmarkIds(new Set(bookmarks.map(b => b.id)))
    }
  }

  const selectAll = () => {
    setSelectedBookmarkIds(new Set(bookmarks.map(b => b.id)))
  }

  const deselectAll = () => {
    setSelectedBookmarkIds(new Set())
  }

  const openSelectedTabs = async () => {
    const selectedBookmarks = bookmarks.filter(b => selectedBookmarkIds.has(b.id))
    const urls = selectedBookmarks.map(b => b.url)

    // Try using the extension first (bypasses popup blockers)
    if (typeof window !== 'undefined' && (window as typeof window & { chrome?: { runtime?: object } }).chrome?.runtime) {
      try {
        // Dynamic import to avoid SSR issues
        const { getExtensionId } = await import('@/lib/extension-detect')
        const extensionId = getExtensionId()

        if (extensionId) {
          ;(window as typeof window & { chrome: { runtime: { sendMessage: (extensionId: string, message: { action: string; urls: string[] }, callback: () => void) => void; lastError?: { message: string } } } }).chrome.runtime.sendMessage(extensionId, { action: 'openUrls', urls }, () => {
            if ((window as typeof window & { chrome: { runtime: { lastError?: { message: string } } } }).chrome.runtime.lastError) {
              // Extension not available, fall back to anchor method
              openTabsFallback(urls)
            }
          })
          // Clear selection after opening
          setSelectedBookmarkIds(new Set())
          setSelectionMode(false)
          return
        }
      } catch {
        // Extension detection failed, fall through to fallback
      }
    }

    // Fallback: Create anchor elements and click them
    openTabsFallback(urls)
    // Clear selection after opening
    setSelectedBookmarkIds(new Set())
    setSelectionMode(false)
  }

  const openTabsFallback = (urls: string[]) => {
    urls.forEach((url) => {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  const exitSelectionMode = () => {
    setSelectedBookmarkIds(new Set())
    setSelectionMode(false)
  }

  const bulkRemoveSelected = async () => {
    if (selectedBookmarkIds.size === 0) return

    setActionLoading(true)

    // Check if user is owner
    const isOwner = collection?.user_id === currentUserId

    if (isOwner) {
      // Owner: actually delete from collection_bookmarks (removes for everyone)
      for (const bookmarkId of selectedBookmarkIds) {
        await supabase
          .from('collection_bookmarks')
          .delete()
          .eq('collection_id', collectionId)
          .eq('bookmark_id', bookmarkId)
      }

      // Refresh data
      await fetchData()
    } else {
      // Non-owner: add to removed_collection_bookmarks (only hides from their view)
      const inserts = Array.from(selectedBookmarkIds).map(bookmarkId =>
        supabase
          .from('removed_collection_bookmarks')
          .insert({
            collection_id: collectionId,
            bookmark_id: bookmarkId,
            user_id: currentUserId!
          })
      )

      const results = await Promise.all(inserts)

      // Optimistically update UI
      const updatedBookmarks = bookmarks.filter(b => !selectedBookmarkIds.has(b.id))
      setBookmarks(updatedBookmarks)
    }

    setSelectedBookmarkIds(new Set())
    setSelectionMode(false)
    setActionLoading(false)
  }

  const bulkMarkAsRead = async () => {
    if (selectedBookmarkIds.size === 0) return

    const idsArray = Array.from(selectedBookmarkIds)

    // Update in database
    await supabase
      .from('bookmarks')
      .update({ is_read: true })
      .in('id', idsArray)

    // Update local state
    setBookmarks(prev => prev.map(b =>
      idsArray.includes(b.id) ? { ...b, is_read: true } : b
    ))
  }

  const bulkMarkAsUnread = async () => {
    if (selectedBookmarkIds.size === 0) return

    const idsArray = Array.from(selectedBookmarkIds)

    // Update in database
    await supabase
      .from('bookmarks')
      .update({ is_read: false })
      .in('id', idsArray)

    // Update local state
    setBookmarks(prev => prev.map(b =>
      idsArray.includes(b.id) ? { ...b, is_read: false } : b
    ))
  }

  if (loading) {
    return null // Suspense will show the loader
  }

  if (!collection) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
        Collection not found
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        {/* Back button row */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push('/collections')}>
              ← Back
            </Button>
          </div>

          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {selectionMode && selectedBookmarkIds.size > 0 && (
              <>
                <Button
                  onClick={openSelectedTabs}
                  style={{ backgroundColor: '#22c55e', color: 'white' }}
                >
                  Open Selected ({selectedBookmarkIds.size})
                </Button>
                <Button
                  onClick={bulkRemoveSelected}
                  variant="secondary"
                  style={{ backgroundColor: '#fecaca', color: '#dc2626' }}
                >
                  Remove Selected
                </Button>
              </>
            )}
            {!selectionMode && (
              <>
                <Button onClick={() => setAddModalOpen(true)}>+ Add Bookmark</Button>
                <Button
                  variant="secondary"
                  onClick={openEditModal}
                >
                  Edit Collection
                </Button>
                <Button
                  variant="secondary"
                  onClick={openDeleteModal}
                  disabled={actionLoading}
                  style={{ backgroundColor: '#fecaca', color: '#dc2626' }}
                >
                  Delete Collection
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Collection info below */}
        <div className="ml-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {collection.name}
            </h1>
            <button
              onClick={togglePublic}
              className={`px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity ${collection.is_public ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}
              title={`Click to make ${collection.is_public ? 'private' : 'public'}`}
            >
              {collection.is_public ? '🌐 Public' : '🔒 Private'}
            </button>
          </div>

          {/* Description and count */}
          <div className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            {collection.description && (
              <p>{collection.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <p>
                {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
              </p>
              {bookmarks.length > 0 && !selectionMode && (
                <Button variant="secondary" onClick={() => setSelectionMode(true)} className="text-sm py-1.5 px-3">
                  Select
                </Button>
              )}
              {selectionMode && (
                <>
                  {selectedBookmarkIds.size < bookmarks.length && (
                    <Button variant="secondary" onClick={selectAll} className="text-sm py-1.5 px-3">
                      Select All
                    </Button>
                  )}
                  {selectedBookmarkIds.size > 0 && (
                    <Button variant="secondary" onClick={deselectAll} className="text-sm py-1.5 px-3">
                      Deselect All
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={exitSelectionMode}
                    className="text-sm py-1.5 px-3"
                    style={{ backgroundColor: '#fecaca', color: '#dc2626' }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {bookmarks.length > 0 && (
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r={8} strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
          </svg>
          <Input
            placeholder="Search bookmarks in this collection..."
            value={collectionSearchQuery}
            onChange={(e) => setCollectionSearchQuery(e.target.value)}
            className="pl-10"
          />
          {collectionSearchQuery && (
            <button
              onClick={() => setCollectionSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Bookmarks List */}
      {bookmarks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            No bookmarks in this collection yet.
            <br />
            <Button onClick={() => setAddModalOpen(true)} className="mt-4">
              + Add Your First Bookmark
            </Button>
          </CardContent>
        </Card>
      ) : filteredBookmarks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            No bookmarks match &ldquo;{collectionSearchQuery}&rdquo;
            <br />
            <button
              onClick={() => setCollectionSearchQuery('')}
              className="mt-4 px-4 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Clear Search
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBookmarks.map((bookmark, index) => {
            const isSelected = selectedBookmarkIds.has(bookmark.id)
            return (
              <Card
                key={bookmark.id || `bookmark-${index}`}
                className={`transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-pointer group ${
                  selectionMode && isSelected ? 'ring-2 ring-blue-500' : ''
                }`}
                style={{ backgroundColor: 'var(--bg-secondary)' }}
                onClick={(e) => {
                  // Only toggle selection if in selection mode and clicking outside buttons
                  if (selectionMode) {
                    toggleBookmarkSelection(bookmark.id)
                  }
                }}
              >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Checkbox in selection mode */}
                      {selectionMode && (
                        <div className="flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBookmarkSelection(bookmark.id)}
                            className="w-5 h-5 rounded cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ accentColor: '#3b82f6' }}
                          />
                        </div>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(bookmark.url)}&sz=32`}
                        className="w-10 h-10 rounded flex-shrink-0"
                        alt=""
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {bookmark.title || bookmark.url || 'Untitled'}
                          </p>
                          {bookmark.added_by && bookmark.added_by !== currentUserId && (
                            <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                              Added by {bookmark.added_by === collection?.user_id ? 'owner' : userNames[bookmark.added_by] || 'another user'}
                            </span>
                          )}
                          {bookmark.added_by && bookmark.added_by === currentUserId && (
                            <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                              Added by you
                            </span>
                          )}
                        </div>
                        <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
                        {bookmark.description && (
                          <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                            {bookmark.description}
                          </p>
                        )}
                      </div>
                      {!selectionMode && (
                        <div className="flex items-center gap-2 flex-shrink-0" style={{ pointerEvents: 'auto', zIndex: 10 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFavorite(bookmark.id, bookmark.is_favorite)
                            }}
                            className="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                            title={bookmark.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          >
                            <svg
                              className={`w-5 h-5 ${bookmark.is_favorite ? 'text-yellow-500' : 'text-gray-400'}`}
                              fill={bookmark.is_favorite ? "currentColor" : "none"}
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFromCollection(bookmark.id)
                            }}
                            className="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-800"
                            title="Remove from collection"
                            style={{ cursor: 'pointer', pointerEvents: 'auto', color: 'var(--text-secondary)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-800 inline-flex items-center justify-center"
                            title="Open in new tab"
                            style={{ cursor: 'pointer', pointerEvents: 'auto', color: 'var(--text-secondary)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
            )
          })}
        </div>
      )}

      {/* Add Bookmark Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => { setAddModalOpen(false); setShowNewBookmarkForm(false); setNewBookmarkUrl(''); setNewBookmarkTitle(''); setSelectedBookmarkIds(new Set()); setBookmarkFilterType('all'); setBookmarkSearchQuery(''); }}
        title="Add Bookmark"
        size="sm"
        footer={
          !showNewBookmarkForm ? (
            <>
              <button
                key="cancel"
                onClick={() => setAddModalOpen(false)}
                className="flex-1 px-3 py-3 rounded-xl font-medium transition-all duration-200 border"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                  e.currentTarget.style.borderColor = 'var(--text-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                }}
              >
                Cancel
              </button>
              <button
                key="save"
                onClick={() => addToCollection(selectedBookmarkIds, collectionId)}
                disabled={selectedBookmarkIds.size === 0}
                className="flex-1 px-3 py-3 rounded-xl font-medium text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: selectedBookmarkIds.size > 0 ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'var(--bg-secondary)',
                  color: selectedBookmarkIds.size > 0 ? 'white' : 'var(--text-secondary)',
                  cursor: selectedBookmarkIds.size > 0 ? 'pointer' : 'not-allowed'
                }}
              >
                Save {selectedBookmarkIds.size > 0 && `(${selectedBookmarkIds.size})`}
              </button>
            </>
          ) : null
        }
      >
        <div className="space-y-4">
          {/* Main Tabs: Create New / Select from Existing */}
          <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <button
              onClick={() => setShowNewBookmarkForm(true)}
              className={`flex-1 py-2 text-sm font-medium transition-all ${showNewBookmarkForm ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'}`}
              style={{ color: showNewBookmarkForm ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Create New
            </button>
            <button
              onClick={() => setShowNewBookmarkForm(false)}
              className={`flex-1 py-2 text-sm font-medium transition-all ${!showNewBookmarkForm ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'}`}
              style={{ color: !showNewBookmarkForm ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Select from Existing
            </button>
          </div>

          {!showNewBookmarkForm ? (
            <>
              {/* Filter Tabs: All / Favorites / Reading List */}
              <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  onClick={() => setBookmarkFilterType('all')}
                  className={`flex-1 py-2 text-sm font-medium transition-all ${bookmarkFilterType === 'all' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'}`}
                  style={{ color: bookmarkFilterType === 'all' ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  All
                </button>
                <button
                  onClick={() => setBookmarkFilterType('favorites')}
                  className={`flex-1 py-2 text-sm font-medium transition-all ${bookmarkFilterType === 'favorites' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'}`}
                  style={{ color: bookmarkFilterType === 'favorites' ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Favorites
                </button>
                <button
                  onClick={() => setBookmarkFilterType('reading-list')}
                  className={`flex-1 py-2 text-sm font-medium transition-all ${bookmarkFilterType === 'reading-list' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'}`}
                  style={{ color: bookmarkFilterType === 'reading-list' ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Reading List
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r={8} strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search bookmarks..."
                  value={bookmarkSearchQuery}
                  onChange={(e) => setBookmarkSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                />
              </div>

              {/* Selected count - show above list */}
              {selectedBookmarkIds.size > 0 && (
                <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                  {selectedBookmarkIds.size} bookmark{selectedBookmarkIds.size > 1 ? 's' : ''} selected
                </p>
              )}

              {/* Scrollable bookmark list */}
              <div className="space-y-2" style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {/* Filter and search bookmarks */}
              {(() => {
                let filtered = availableBookmarks
                if (bookmarkFilterType === 'favorites') {
                  filtered = filtered.filter(b => b.is_favorite)
                } else if (bookmarkFilterType === 'reading-list') {
                  filtered = filtered.filter(b => !b.is_read)
                }
                if (bookmarkSearchQuery) {
                  const query = bookmarkSearchQuery.toLowerCase()
                  filtered = filtered.filter(b =>
                    b.title?.toLowerCase().includes(query) ||
                    b.url?.toLowerCase().includes(query)
                  )
                }
                return filtered
              })().map(bookmark => {
                const isSelected = selectedBookmarkIds.has(bookmark.id)
                return (
                  <button
                    key={bookmark.id}
                    onClick={() => {
                      const newSelected = new Set(selectedBookmarkIds)
                      if (isSelected) {
                        newSelected.delete(bookmark.id)
                      } else {
                        newSelected.add(bookmark.id)
                      }
                      setSelectedBookmarkIds(newSelected)
                    }}
                    className="w-full p-3 rounded-lg text-left transition-all cursor-pointer flex items-center gap-3"
                    style={{
                      backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-secondary)',
                      border: isSelected ? '2px solid #8b5cf6' : '2px solid transparent',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {/* Checkbox */}
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{
                      backgroundColor: isSelected ? '#8b5cf6' : 'var(--bg-primary)',
                      border: isSelected ? '2px solid #8b5cf6' : '2px solid var(--border-color)'
                    }}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    {/* Favicon */}
                    <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(bookmark.url)}&sz=32`}
                        className="w-8 h-8"
                        alt=""
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{bookmark.title}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
                    </div>

                    {/* Favorite indicator */}
                    {bookmark.is_favorite && (
                      <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    )}
                    {/* Reading list indicator (book icon) */}
                    {!bookmark.is_read && (
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    )}
                  </button>
                )
              })}

              {/* Filter bookmarks for the list */}
              {(() => {
                let filtered = availableBookmarks
                if (bookmarkFilterType === 'favorites') {
                  filtered = filtered.filter(b => b.is_favorite)
                } else if (bookmarkFilterType === 'reading-list') {
                  filtered = filtered.filter(b => !b.is_read)
                }
                if (bookmarkSearchQuery) {
                  const query = bookmarkSearchQuery.toLowerCase()
                  filtered = filtered.filter(b =>
                    b.title?.toLowerCase().includes(query) ||
                    b.url?.toLowerCase().includes(query)
                  )
                }
                return filtered.length === 0
              })() && (
                <p style={{ color: 'var(--text-secondary)' }} className="text-center py-8">No bookmarks found</p>
              )}
              </div>
            </>
          ) : (
            <>
              <form onSubmit={createAndAddBookmark} className="space-y-3">
                <Input
                  label="URL"
                  placeholder="https://example.com"
                  value={newBookmarkUrl}
                  onChange={(e) => setNewBookmarkUrl(e.target.value)}
                  required
                />
                <Input
                  label="Title (optional)"
                  placeholder="Bookmark title"
                  value={newBookmarkTitle}
                  onChange={(e) => setNewBookmarkTitle(e.target.value)}
                />
                {formError && (
                  <p className="text-red-500 text-sm">{formError}</p>
                )}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setAddModalOpen(false); setNewBookmarkUrl(''); setNewBookmarkTitle(''); }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Add to Collection
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Collection">
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to delete &ldquo;<strong>{collection?.name}</strong>&rdquo;?
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Bookmarks will be kept but removed from this collection.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={actionLoading}
              className="flex-1"
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              {actionLoading ? 'Deleting...' : 'Delete Collection'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Collection Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Collection">
        <form onSubmit={updateCollection} className="space-y-4">
          <Input
            label="Collection Name"
            placeholder="My Favorite Articles"
            value={editFormData.name}
            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
            required
          />
          <Textarea
            label="Description (optional)"
            placeholder="A collection of useful resources"
            value={editFormData.description}
            onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
            rows={3}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editFormData.is_public}
              onChange={(e) => setEditFormData({ ...editFormData, is_public: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">Make public (shareable)</span>
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Visibility Change Confirmation Modal */}
      <Modal
        isOpen={visibilityConfirmModalOpen}
        onClose={cancelVisibilityChange}
        title={pendingVisibilityChange ? 'Make Collection Public?' : 'Make Collection Private?'}
      >
        <div className="space-y-4">
          <div style={{ color: 'var(--text-secondary)' }}>
            {pendingVisibilityChange ? (
              <>
                You are about to make this collection <strong>public</strong>. This will:
                <ul className="list-disc list-inside mt-2 ml-4" style={{ color: 'var(--text-secondary)' }}>
                  <li>Allow anyone with the collection link to view it</li>
                  <li>Allow shared users to add their own bookmarks</li>
                  <li>Make it visible to all users you share it with</li>
                </ul>
              </>
            ) : (
              <>
                You are about to make this collection <strong>private</strong>. This will:
                <ul className="list-disc list-inside mt-2 ml-4" style={{ color: 'var(--text-secondary)' }}>
                  <li>Remove it from all shared users&apos; views (except the owner)</li>
                  <li>Only you will be able to see and manage it</li>
                  <li>Existing shared users won&apos;t be able to access it anymore</li>
                </ul>
              </>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={cancelVisibilityChange}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmVisibilityChange}
              className="flex-1"
              style={{ backgroundColor: pendingVisibilityChange ? '#22c55e' : '#dc2626', color: 'white' }}
            >
              {pendingVisibilityChange ? 'Make Public' : 'Make Private'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
