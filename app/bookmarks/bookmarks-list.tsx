'use client'

import { useState, useMemo, memo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { OpenTabsModal } from '@/components/open-tabs-modal'
import { Toast, ConfirmDialog } from '@/components/ui/toast'
import type { Bookmark, Tag } from '@/lib/types'

interface BookmarksListProps {
  initialBookmarks: Bookmark[]
  initialTags: Tag[]
  initialBookmarkTags: Record<string, Tag[]>
  isGuest?: boolean
}

// Helper for sessionStorage
function sessionStoreGet(key: string): any {
  if (typeof window === 'undefined') return null
  try {
    const item = sessionStorage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch { return null }
}

function sessionStoreSet(key: string, value: any): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch (e) { console.error('sessionStorage error:', e) }
}

function sessionStoreRemove(key: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(key)
}

// Simple memoized bookmark card
const BookmarkCard = memo(({ bookmark, tags, onFavorite, onRead, onEdit, onDelete, onAddToCollection }: {
  bookmark: Bookmark
  tags: Tag[]
  onFavorite: () => void
  onRead: () => void
  onEdit: () => void
  onDelete: () => void
  onAddToCollection: () => void
}) => {
  const getDomain = (url: string) => {
    try { return new URL(url).hostname }
    catch { return url }
  }

  return (
    <Card className="hover:scale-[1.02] hover:shadow-lg transition-all duration-200 cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            <img
              src={`https://www.google.com/s2/favicons?domain=${getDomain(bookmark.url)}&sz=32`}
              className="w-8 h-8 rounded"
              alt=""
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:text-blue-600 truncate block"
              style={{ color: 'var(--text-primary)' }}
            >
              {bookmark.title}
            </a>
            <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
            {bookmark.description && (
              <p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{bookmark.description}</p>
            )}
            <div className="flex gap-2 mt-2 flex-wrap">
              {tags.map(tag => (
                <span key={tag.id} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: tag.color + '20', color: tag.color }}>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={onFavorite} className={`p-2 rounded transition-all hover:text-yellow-500 cursor-pointer ${bookmark.is_favorite ? 'text-yellow-500' : 'text-gray-400'}`}>
            <svg className="w-5 h-5" fill={bookmark.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
          </button>
          <button onClick={onRead} className={`p-2 rounded transition-all hover:text-green-600 cursor-pointer ${!bookmark.is_read ? 'text-green-600' : 'text-gray-400'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </button>
          <button onClick={onEdit} className="p-2 rounded transition-all text-gray-400 hover:text-blue-600 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={onAddToCollection} className="p-2 rounded transition-all text-gray-400 hover:text-purple-600 cursor-pointer" title="Add to collection">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
          </button>
          <button onClick={onDelete} className="p-2 rounded transition-all text-gray-400 hover:text-red-600 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </CardContent>
    </Card>
  )
})

BookmarkCard.displayName = 'BookmarkCard'

export function BookmarksList({ initialBookmarks, initialTags, initialBookmarkTags, isGuest = false }: BookmarksListProps) {
  const [bookmarks, setBookmarks] = useState(initialBookmarks)
  const [tags] = useState(initialTags)
  const [bookmarkTags, setBookmarkTags] = useState(initialBookmarkTags)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<'favorites' | 'reading-list'>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [openTabsModalOpen, setOpenTabsModalOpen] = useState(false)
  const [collectionModalOpen, setCollectionModalOpen] = useState(false)
  const [collections, setCollections] = useState<any[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [bookmarkForCollection, setBookmarkForCollection] = useState<Bookmark | null>(null)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const [bookmarkCollectionMap, setBookmarkCollectionMap] = useState<Record<string, Set<string>>>({})
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)
  const [formData, setFormData] = useState({ url: '', title: '', description: '', notes: '' })
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [newTagName, setNewTagName] = useState('')

  // Toast and confirm dialog state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [pendingTabs, setPendingTabs] = useState<{ url: string; title: string }[] | null>(null)

  // AI tag suggestions state
  const [aiEnabled, setAiEnabled] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [aiSuggestedTagIds, setAiSuggestedTagIds] = useState<Set<string>>(new Set())
  const [aiSuggestions, setAiSuggestions] = useState<{ id: string; name: string; color: string; isNew: boolean }[]>([])

  // Check if AI is enabled on mount
  useEffect(() => {
    fetch('/api/ai/suggest-tags')
      .then((res) => res.json())
      .then((data) => setAiEnabled(data.enabled))
      .catch(() => setAiEnabled(false))
  }, [])

  // Preload bookmark-collection relationships and collections list for instant modal opening
  useEffect(() => {
    if (isGuest) return

    const loadData = async () => {
      // Load bookmark-collection relationships
      const { data: bookmarkCollections } = await supabase
        .from('collection_bookmarks')
        .select('bookmark_id, collection_id')

      if (bookmarkCollections) {
        const map: Record<string, Set<string>> = {}
        for (const item of bookmarkCollections) {
          if (!map[item.bookmark_id]) {
            map[item.bookmark_id] = new Set()
          }
          map[item.bookmark_id].add(item.collection_id)
        }
        setBookmarkCollectionMap(map)
      }

      // Preload collections list in parallel
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (token) {
          try {
            const response = await fetch('/api/collections?all=true', {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            if (response.ok) {
              const result = await response.json()
              setCollections(result.collections || [])
            }
          } catch (error) {
            console.error('Failed to preload collections:', error)
          }
        }
      }
    }

    loadData()
  }, [isGuest])

  // Real-time subscription for bookmarks and tags (non-guest only)
  useEffect(() => {
    if (isGuest) return

    const channel = supabase
      .channel('bookmarks-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookmarks'
        },
        async (payload: any) => {
          console.log('Realtime INSERT:', payload.new)
          const newBookmark = payload.new as Bookmark

          // Add bookmark to state
          setBookmarks(prev => [newBookmark, ...prev])

          // Fetch tags for the new bookmark (with small delay to ensure tags are saved)
          setTimeout(async () => {
            const { data: tagData } = await supabase
              .from('bookmark_tags')
              .select('tag_id, tags(*)')
              .eq('bookmark_id', newBookmark.id)

            const fetchedTags = tagData?.map((bt: any) => bt.tags).filter(Boolean) || []
            console.log('Fetched tags for new bookmark:', fetchedTags)

            setBookmarkTags(prev => ({
              ...prev,
              [newBookmark.id]: fetchedTags
            }))
          }, 500)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookmarks'
        },
        (payload: any) => {
          console.log('Realtime UPDATE:', payload.new)
          setBookmarks(prev => prev.map(b => b.id === payload.new.id ? payload.new as Bookmark : b))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'bookmarks'
        },
        (payload: any) => {
          console.log('Realtime DELETE:', payload.old)
          setBookmarks(prev => prev.filter(b => b.id !== payload.old.id))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookmark_tags'
        },
        async (payload: any) => {
          console.log('Realtime bookmark_tag INSERT:', payload.new)
          const bookmarkId = payload.new.bookmark_id

          // Fetch the tag details
          const { data: tagData } = await supabase
            .from('bookmark_tags')
            .select('tag_id, tags(*)')
            .eq('bookmark_id', bookmarkId)

          const fetchedTags = tagData?.map((bt: any) => bt.tags).filter(Boolean) || []

          setBookmarkTags(prev => ({
            ...prev,
            [bookmarkId]: fetchedTags
          }))
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isGuest])

  // Auto-cleanup unused tags on mount (for logged-in users only)
  useEffect(() => {
    if (isGuest) return

    const cleanupUnusedTags = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get used tag IDs
      const { data: usedTagIds } = await supabase
        .from('bookmark_tags')
        .select('tag_id')

      const usedIds = new Set(usedTagIds?.map((bt: { tag_id: string }) => bt.tag_id) || [])

      // Find unused tag IDs first (before modifying array)
      const unusedTagIds: string[] = []
      for (const tag of tags) {
        if (!usedIds.has(tag.id)) {
          unusedTagIds.push(tag.id)
        }
      }

      if (unusedTagIds.length === 0) return

      // Remove unused tags from the array (in-place, reverse order)
      for (let i = tags.length - 1; i >= 0; i--) {
        if (!usedIds.has(tags[i].id)) {
          tags.splice(i, 1)
        }
      }

      // Delete from database in background
      await supabase
        .from('tags')
        .delete()
        .in('id', unusedTagIds)
    }

    cleanupUnusedTags()
  }, [isGuest])

  // Save to sessionStorage for guest mode
  const saveGuestBookmarks = (updatedBookmarks: Bookmark[]) => {
    sessionStoreSet('workstack_guest_bookmarks', updatedBookmarks)
    setBookmarks(updatedBookmarks)
  }

  // Memoized filtering - instant search + filter
  const filteredBookmarks = useMemo(() => {
    let filtered = bookmarks

    // Apply active filters (can be multiple)
    if (activeFilters.has('favorites')) {
      filtered = filtered.filter(b => b.is_favorite)
    }
    if (activeFilters.has('reading-list')) {
      filtered = filtered.filter(b => !b.is_read) // Show unread (to be read)
    }

    // Apply search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.description?.toLowerCase().includes(q))
      )
    }

    return filtered
  }, [bookmarks, searchQuery, activeFilters])

  // Toggle filter on/off
  const toggleFilter = (filterType: 'favorites' | 'reading-list') => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev)
      if (newFilters.has(filterType)) {
        newFilters.delete(filterType)
      } else {
        newFilters.add(filterType)
      }
      return newFilters
    })
  }

  // Clear all filters
  const clearAllFilters = () => {
    setActiveFilters(new Set())
  }

  // Open collection modal and fetch collections
  const openCollectionModal = async (bookmark: Bookmark) => {
    if (isGuest) {
      setToast({ message: 'Collections are not available in guest mode', type: 'error' })
      return
    }

    setBookmarkForCollection(bookmark)

    // Use cached map for instant selections
    const existingIds = bookmarkCollectionMap[bookmark.id] || new Set()
    setSelectedCollectionIds(new Set(existingIds))

    // Show loading if collections aren't cached yet
    const needsCollections = collections.length === 0
    if (needsCollections) {
      setCollectionsLoading(true)
    }

    // Open modal immediately
    setCollectionModalOpen(true)

    // Always fetch fresh data in background to ensure cache is up to date
    ;(async () => {
      // Fetch latest collections for this bookmark
      const { data: latestCollections } = await supabase
        .from('collection_bookmarks')
        .select('collection_id')
        .eq('bookmark_id', bookmark.id)

      if (latestCollections) {
        const latestIds = new Set(latestCollections.map((c: any) => c.collection_id))
        // Update cache
        setBookmarkCollectionMap(prev => ({
          ...prev,
          [bookmark.id]: latestIds
        }))
        // Update selections if changed
        setSelectedCollectionIds(latestIds)
      }

      // Fetch collections list if not cached
      if (needsCollections) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const token = (await supabase.auth.getSession()).data.session?.access_token
          if (token) {
            try {
              const response = await fetch('/api/collections?all=true', {
                headers: { 'Authorization': `Bearer ${token}` }
              })
              if (response.ok) {
                const result = await response.json()
                setCollections(result.collections || [])
              }
            } catch (error) {
              console.error('Failed to fetch collections:', error)
            } finally {
              setCollectionsLoading(false)
            }
          } else {
            setCollectionsLoading(false)
          }
        } else {
          setCollectionsLoading(false)
        }
      }
    })()
  }

  // Add bookmark to collection(s)
  const handleAddToCollection = async () => {
    if (!bookmarkForCollection) return

    // Capture values before clearing state
    const bookmarkId = bookmarkForCollection.id
    const targetCollectionIds = new Set(selectedCollectionIds)
    const finalCount = targetCollectionIds.size

    // Close modal and show toast immediately for instant feedback
    setCollectionModalOpen(false)
    setBookmarkForCollection(null)
    setSelectedCollectionIds(new Set())

    setToast({
      message: finalCount > 0
        ? `Added to ${finalCount} collection${finalCount > 1 ? 's' : ''}`
        : 'Removed from collections',
      type: 'success'
    })

    // Update cached map immediately
    setBookmarkCollectionMap(prev => ({
      ...prev,
      [bookmarkId]: new Set(targetCollectionIds)
    }))

    // Do database operations in background
    ;(async () => {
      try {
        // Get currently selected collections from junction table
        const { data: existingCollections } = await supabase
          .from('collection_bookmarks')
          .select('collection_id')
          .eq('bookmark_id', bookmarkId)

        const existingIds = new Set(existingCollections?.map((c: any) => c.collection_id) || [])

        // Add to new collections
        const toAdd = Array.from(targetCollectionIds).filter(id => !existingIds.has(id))
        // Remove from unselected collections
        const toRemove = Array.from(existingIds).filter(id => !targetCollectionIds.has(id))

        // Add new relationships
        for (const collectionId of toAdd) {
          await supabase
            .from('collection_bookmarks')
            .insert({ collection_id: collectionId, bookmark_id: bookmarkId })
        }

        // Remove old relationships
        for (const collectionId of toRemove) {
          await supabase
            .from('collection_bookmarks')
            .delete()
            .eq('collection_id', collectionId)
            .eq('bookmark_id', bookmarkId)
        }
      } catch (error) {
        console.error('Failed to update collections:', error)
        setToast({ message: 'Failed to update collections', type: 'error' })
      }
    })()
  }

  const handleFavorite = async (bookmark: Bookmark) => {
    const updated = bookmarks.map(b => b.id === bookmark.id ? { ...b, is_favorite: !b.is_favorite } : b)

    if (isGuest) {
      saveGuestBookmarks(updated)
    } else {
      await supabase.from('bookmarks').update({ is_favorite: !bookmark.is_favorite }).eq('id', bookmark.id)
      setBookmarks(updated)
    }
  }

  const handleRead = async (bookmark: Bookmark) => {
    const updated = bookmarks.map(b => b.id === bookmark.id ? { ...b, is_read: !b.is_read } : b)

    if (isGuest) {
      saveGuestBookmarks(updated)
    } else {
      await supabase.from('bookmarks').update({ is_read: !bookmark.is_read }).eq('id', bookmark.id)
      setBookmarks(updated)
    }
  }

  const handleDelete = async (id: string) => {
    const bookmarkToDelete = bookmarks.find(b => b.id === id)
    if (!bookmarkToDelete) return

    setConfirmDialog({
      message: `Are you sure you want to delete "${bookmarkToDelete.title || bookmarkToDelete.url}"?`,
      onConfirm: async () => {
        const updated = bookmarks.filter(b => b.id !== id)

        if (isGuest) {
          saveGuestBookmarks(updated)
        } else {
          await supabase.from('bookmarks').delete().eq('id', id)
          setBookmarks(updated)

          // Auto-cleanup unused tags in background
          const { data: usedTagIds } = await supabase
            .from('bookmark_tags')
            .select('tag_id')

          const usedIds = new Set(usedTagIds?.map((bt: { tag_id: string }) => bt.tag_id) || [])
          const unusedTags = tags.filter(t => !usedIds.has(t.id))

          if (unusedTags.length > 0) {
            // Remove from local state
            unusedTags.forEach(tag => {
              const index = tags.findIndex(t => t.id === tag.id)
          if (index > -1) {
            tags.splice(index, 1)
          }
        })
        // Delete from database
        await supabase
          .from('tags')
          .delete()
          .in('id', unusedTags.map(t => t.id))
      }
    }
        setConfirmDialog(null)
      }
    })
  }

  const handleAddTag = async () => {
    if (!newTagName.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Check if tag already exists
    const existingTag = tags.find(t => t.name.toLowerCase() === newTagName.toLowerCase())
    if (existingTag) {
      if (!selectedTagIds.includes(existingTag.id)) {
        setSelectedTagIds([...selectedTagIds, existingTag.id])
      }
      setNewTagName('')
      return
    }

    // Create new tag with consistent color (cycle through predefined colors)
    const tagColors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1']
    const nextColorIndex = tags.length % tagColors.length
    const { data } = await supabase.from('tags').insert({
      name: newTagName.trim(),
      color: tagColors[nextColorIndex],
      user_id: user.id
    }).select().single()

    if (data) {
      tags.push(data)
      setSelectedTagIds([...selectedTagIds, data.id])
    }
    setNewTagName('')
  }

  const handleAiSuggestTags = async () => {
    if (!formData.url) {
      setToast({ message: 'Please enter a URL first', type: 'error' })
      return
    }

    setIsSuggesting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsSuggesting(false)
      return
    }

    try {
      const response = await fetch('/api/ai/suggest-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          url: formData.url,
          title: formData.title,
          description: formData.description
        })
      })

      const data = await response.json()

      if (data.error) {
        setToast({ message: data.error, type: 'error' })
      } else if (data.suggested && data.suggested.length > 0) {
        // Store suggestions - don't auto-select, let user choose
        setAiSuggestions(data.suggested)
        setAiSuggestedTagIds(new Set(data.suggested.map((t: any) => t.id)))

        const summary = data.summary
        setToast({
          message: `AI suggested ${summary.total} tag(s): ${summary.matched} existing, ${summary.created} new`,
          type: 'success'
        })
      } else {
        setToast({ message: 'No tag suggestions generated', type: 'info' })
      }
    } catch (error) {
      console.error('AI suggest error:', error)
      setToast({ message: 'Failed to get AI suggestions', type: 'error' })
    } finally {
      setIsSuggesting(false)
    }
  }

  const toggleAiSuggestion = (tag: { id: string; name: string; color: string; isNew: boolean }) => {
    // Remove from AI suggestions first
    setAiSuggestions(aiSuggestions.filter(t => t.id !== tag.id))

    if (tag.isNew) {
      // For new tags, create them when selected
      // Add to the tags array
      tags.push({ id: tag.id, name: tag.name, color: tag.color, user_id: '', created_at: '' })
    }
    // Add to selected tags (whether new or existing)
    if (!selectedTagIds.includes(tag.id)) {
      setSelectedTagIds([...selectedTagIds, tag.id])
    }
  }

  const dismissAiSuggestions = () => {
    setAiSuggestions([])
    setAiSuggestedTagIds(new Set())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isGuest) {
      // Guest mode - save to sessionStorage
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        user_id: '',
        url: formData.url,
        title: formData.title || new URL(formData.url).hostname,
        description: formData.description || null,
        notes: formData.notes || null,
        is_read: true,
        is_favorite: false,
        collection_id: null,
        folder_id: null,
        favicon_url: null,
        screenshot_url: null,
        last_opened_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      saveGuestBookmarks([...bookmarks, newBookmark])
      setModalOpen(false)
      setFormData({ url: '', title: '', description: '', notes: '' })
      setSelectedTagIds([])
      setAiSuggestedTagIds(new Set())
      setAiSuggestions([])
    } else {
      // Logged in - save to Supabase
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (editingBookmark) {
        await supabase.from('bookmarks').update({
          url: formData.url,
          title: formData.title || new URL(formData.url).hostname,
          description: formData.description || null,
        }).eq('id', editingBookmark.id)

        // Update tags - remove old ones, add new ones
        await supabase.from('bookmark_tags').delete().eq('bookmark_id', editingBookmark.id)
        for (const tagId of selectedTagIds) {
          await supabase.from('bookmark_tags').insert({ bookmark_id: editingBookmark.id, tag_id: tagId })
        }
      } else {
        const { data } = await supabase.from('bookmarks').insert({
          url: formData.url,
          title: formData.title || new URL(formData.url).hostname,
          description: formData.description || null,
          user_id: user.id,
        }).select().single()

        // Add tags
        if (data) {
          for (const tagId of selectedTagIds) {
            await supabase.from('bookmark_tags').insert({ bookmark_id: data.id, tag_id: tagId })
          }
        }
      }
      window.location.reload()
    }
  }

  const handleAddMultipleBookmarks = async (tabs: { url: string; title: string }[]) => {
    // Filter out URLs that already exist in bookmarks
    const existingUrls = new Set(bookmarks.map(b => b.url))
    const newTabs = tabs.filter(tab => !existingUrls.has(tab.url))

    if (newTabs.length === 0) {
      setToast({ message: 'All selected tabs are already bookmarked!', type: 'info' })
      return
    }

    // Show how many duplicates were skipped
    if (newTabs.length < tabs.length) {
      const skipped = tabs.length - newTabs.length
      setPendingTabs(newTabs)
      setConfirmDialog({
        message: `${skipped} tab(s) already bookmarked. Add the remaining ${newTabs.length} new tab(s)?`,
        onConfirm: () => {
          addBookmarks(newTabs)
          setConfirmDialog(null)
          setPendingTabs(null)
        }
      })
      return
    }

    await addBookmarks(newTabs)
  }

  const addBookmarks = async (newTabs: { url: string; title: string }[]) => {
    if (isGuest) {
      // Guest mode - save to sessionStorage
      const newBookmarks: Bookmark[] = newTabs.map(tab => ({
        id: crypto.randomUUID(),
        user_id: '',
        url: tab.url,
        title: tab.title || new URL(tab.url).hostname,
        description: null,
        notes: null,
        is_read: true,
        is_favorite: false,
        collection_id: null,
        folder_id: null,
        favicon_url: null,
        screenshot_url: null,
        last_opened_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
      saveGuestBookmarks([...bookmarks, ...newBookmarks])
      setToast({ message: `Added ${newTabs.length} bookmark(s)`, type: 'success' })
    } else {
      // Logged in - save to Supabase
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Insert all bookmarks
      await supabase.from('bookmarks').insert(
        newTabs.map(tab => ({
          url: tab.url,
          title: tab.title || new URL(tab.url).hostname,
          user_id: user.id,
        }))
      )
      setToast({ message: `Added ${newTabs.length} bookmark(s)`, type: 'success' })
      setTimeout(() => window.location.reload(), 1000)
    }
  }

  return (
    <>
      {/* Search bar and Filter buttons */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-40"
        />

        {/* Filter buttons - multi-select */}
        <div className="flex gap-2">
          {/* All button */}
          <button
            onClick={clearAllFilters}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer`}
            style={{
              backgroundColor: activeFilters.size === 0 ? '#3b82f6' : 'var(--bg-secondary)',
              color: activeFilters.size === 0 ? 'white' : 'var(--text-primary)'
            }}
          >
            📚 All
          </button>

          {(['favorites', 'reading-list'] as const).map((filterType) => {
            const isActive = activeFilters.has(filterType)
            return (
              <button
                key={filterType}
                onClick={() => toggleFilter(filterType)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer`}
                style={{
                  backgroundColor: isActive ? '#3b82f6' : 'var(--bg-secondary)',
                  color: isActive ? 'white' : 'var(--text-primary)'
                }}
              >
                {filterType === 'favorites' ? '⭐ Favorites' : '📖 Reading List'}
              </button>
            )
          })}
        </div>

        {isGuest && (
          <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(251, 146, 60, 0.2)', color: '#ea580c' }}>
            Guest mode
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => {setAiSuggestedTagIds(new Set()); setAiSuggestions([]); setModalOpen(true)}}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: '#3b82f6', color: 'white', cursor: 'pointer' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm font-medium">Add Bookmark</span>
        </button>
        <button
          onClick={() => setOpenTabsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
          title="Import open browser tabs as bookmarks"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium">Import Open Tabs</span>
        </button>
      </div>

      {/* Bookmark count */}
      {filteredBookmarks.length > 0 && (
        <div className="mb-4">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {filteredBookmarks.length} bookmark{filteredBookmarks.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Bookmarks grid */}
      {filteredBookmarks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            No bookmarks found. Add your first bookmark!
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              tags={bookmarkTags[bookmark.id] || []}
              onFavorite={() => handleFavorite(bookmark)}
              onRead={() => handleRead(bookmark)}
              onEdit={() => {
                setEditingBookmark(bookmark)
                setFormData({ url: bookmark.url, title: bookmark.title || '', description: bookmark.description || '', notes: bookmark.notes || '' })
                // Set selected tags
                const bookmarkTagIds = (bookmarkTags[bookmark.id] || []).map(t => t.id)
                setSelectedTagIds(bookmarkTagIds)
                setAiSuggestedTagIds(new Set())
                setAiSuggestions([])
                setModalOpen(true)
              }}
              onAddToCollection={() => openCollectionModal(bookmark)}
              onDelete={() => handleDelete(bookmark.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => {setModalOpen(false); setAiSuggestedTagIds(new Set()); setAiSuggestions([])}} title={editingBookmark ? 'Edit Bookmark' : 'Add Bookmark'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isGuest && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>
              <span style={{ color: '#ea580c' }}>⚠️ Guest mode: This bookmark will be lost when you close the browser. <a href="/login" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Sign in</a> to save permanently.</span>
            </div>
          )}
          <Input label="URL" placeholder="https://example.com" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })} required />
          <Input label="Title" placeholder="Bookmark title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          <Textarea label="Description" placeholder="Optional description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />

          {/* Tags Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tags</label>
              {aiEnabled && !isGuest && (
                <button
                  type="button"
                  onClick={handleAiSuggestTags}
                  disabled={isSuggesting || !formData.url}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                    color: 'white',
                    cursor: isSuggesting || !formData.url ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSuggesting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Thinking...
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      AI Suggest Tags
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    if (selectedTagIds.includes(tag.id)) {
                      setSelectedTagIds(selectedTagIds.filter(id => id !== tag.id))
                    } else {
                      setSelectedTagIds([...selectedTagIds, tag.id])
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-sm transition-all ${
                    selectedTagIds.includes(tag.id) ? 'ring-2 ring-offset-1' : ''
                  }`}
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                    cursor: 'pointer',
                    '--tw-ring-color': tag.color
                  } as React.CSSProperties}
                >
                  {aiSuggestedTagIds.has(tag.id) && <span className="mr-1">✨</span>}
                  {selectedTagIds.includes(tag.id) ? '✓ ' : ''}{tag.name}
                </button>
              ))}
            </div>

            {/* AI Suggestions Section */}
            {aiSuggestions.length > 0 && (
              <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: '#8B5CF6' }}>✨ AI Suggestions</span>
                  <button
                    type="button"
                    onClick={dismissAiSuggestions}
                    className="text-xs hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    Dismiss
                  </button>
                </div>

                {/* Existing tags that AI suggested */}
                {aiSuggestions.filter(t => !t.isNew).length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Existing tags</span>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.filter(t => !t.isNew).map(tag => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleAiSuggestion(tag)}
                          className="px-3 py-1 rounded-full text-xs transition-all hover:scale-105"
                          style={{
                            backgroundColor: tag.color + '30',
                            color: tag.color,
                            border: `1px solid ${tag.color}50`,
                            cursor: 'pointer'
                          }}
                        >
                          + {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* New tags that AI suggested */}
                {aiSuggestions.filter(t => t.isNew).length > 0 && (
                  <div>
                    <span className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Suggested new tags (click to create)</span>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.filter(t => t.isNew).map(tag => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleAiSuggestion(tag)}
                          className="px-3 py-1 rounded-full text-xs transition-all hover:scale-105"
                          style={{
                            backgroundColor: 'rgba(139, 92, 246, 0.2)',
                            color: '#8B5CF6',
                            border: '1px dashed #8B5CF6',
                            cursor: 'pointer'
                          }}
                        >
                          ✨ {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New tag name..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                + Add Tag
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => {setModalOpen(false); setSelectedTagIds([]); setNewTagName(''); setAiSuggestedTagIds(new Set()); setAiSuggestions([])}}>Cancel</Button>
            <Button type="submit">{editingBookmark ? 'Update' : 'Add'} Bookmark</Button>
          </div>
        </form>
      </Modal>

      {/* Open Tabs Modal */}
      <OpenTabsModal
        isOpen={openTabsModalOpen}
        onClose={() => setOpenTabsModalOpen(false)}
        onAddBookmarks={handleAddMultipleBookmarks}
      />

      {/* Collection Select Modal */}
      <Modal isOpen={collectionModalOpen} onClose={() => setCollectionModalOpen(false)} title="Add to Collections">
        <div className="space-y-4">
          {collectionsLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-violet-600 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px' }} />
            </div>
          ) : collections.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No collections found. Create one first!</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {collections.map((collection) => {
                const isSelected = selectedCollectionIds.has(collection.id)
                return (
                  <button
                    key={collection.id}
                    onClick={() => {
                      const newSelection = new Set(selectedCollectionIds)
                      if (isSelected) {
                        newSelection.delete(collection.id)
                      } else {
                        newSelection.add(collection.id)
                      }
                      setSelectedCollectionIds(newSelection)
                    }}
                    className="w-full p-3 rounded-lg text-left transition-all cursor-pointer flex items-center gap-3"
                    style={{
                      backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-secondary)',
                      border: isSelected ? '2px solid #8b5cf6' : '2px solid transparent',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {/* Checkbox */}
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{
                      backgroundColor: isSelected ? '#8b5cf6' : 'var(--bg-secondary)',
                      border: isSelected ? '2px solid #8b5cf6' : '2px solid var(--border-color)'
                    }}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)' }}>
                      📦
                    </div>
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{collection.name}</p>
                      {collection.description && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{collection.description}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {selectedCollectionIds.size > 0 && (
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              {selectedCollectionIds.size} collection{selectedCollectionIds.size > 1 ? 's' : ''} selected
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCollectionModalOpen(false)}
              className="flex-1 px-4 py-2 rounded-lg font-medium transition-all"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAddToCollection}
              className="flex-1 px-4 py-2 rounded-lg font-medium text-white transition-all"
              style={{ backgroundColor: '#8b5cf6', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => {
            setConfirmDialog(null)
            setPendingTabs(null)
          }}
        />
      )}
    </>
  )
}
