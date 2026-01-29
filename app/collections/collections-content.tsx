'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import type { Collection, Bookmark } from '@/lib/types'

// Cache for faster loads
const collectionsCache = {
  data: null as { collections: Collection[]; collectionBookmarks: Record<string, Bookmark[]> } | null,
  timestamp: 0,
  CACHE_TTL: 30000 // 30 seconds
}

interface CollectionsContentProps {
  searchQuery: string
  setSearchQuery: (query: string) => void
}

export function CollectionsContent({ searchQuery, setSearchQuery }: CollectionsContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collections, setCollections] = useState<Collection[]>([])
  const [collectionBookmarks, setCollectionBookmarks] = useState<Record<string, Bookmark[]>>({})
  const [loading, setLoading] = useState(true)
  const [availableBookmarks, setAvailableBookmarks] = useState<Bookmark[]>([])
  const [isGuest, setIsGuest] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectCollectionModalOpen, setSelectCollectionModalOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [pendingBookmark, setPendingBookmark] = useState<{ url: string; title: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_public: false,
  })

  useEffect(() => {
    const fetchData = async () => {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Guest mode - load from sessionStorage
        setIsGuest(true)
        try {
          const storedCollections = sessionStorage.getItem('workstack_guest_collections')
          const storedBookmarks = sessionStorage.getItem('workstack_guest_bookmarks')
          if (storedCollections) {
            const parsedCollections = JSON.parse(storedCollections)
            setCollections(parsedCollections)
            // Build collectionBookmarks from guest bookmarks
            if (storedBookmarks) {
              const parsedBookmarks: Bookmark[] = JSON.parse(storedBookmarks)
              const bookmarksMap: Record<string, Bookmark[]> = {}
              parsedCollections.forEach((c: Collection) => {
                bookmarksMap[c.id] = parsedBookmarks
                  .filter((b: Bookmark) => b.collection_id === c.id)
                  .slice(0, 3)
              })
              setCollectionBookmarks(bookmarksMap)
            }
          }
        } catch (e) {
          console.error('Error loading guest data:', e)
        }
        setLoading(false)
        return
      }

      // Check cache first for logged-in users
      const now = Date.now()
      if (collectionsCache.data && now - collectionsCache.timestamp < collectionsCache.CACHE_TTL) {
        setCollections(collectionsCache.data.collections)
        setCollectionBookmarks(collectionsCache.data.collectionBookmarks)
        setLoading(false)
        return
      }

      // Only fetch collections first (fast)
      const { data: collectionsData } = await supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false })

      if (collectionsData) {
        setCollections(collectionsData)

        // Then fetch only first 3 bookmarks per collection for preview (in parallel)
        // Use junction table for many-to-many relationship
        const bookmarkPromises = collectionsData.map(async (collection: Collection) => {
          const { data } = await supabase
            .from('collection_bookmarks')
            .select('bookmark_id, bookmarks(*)')
            .eq('collection_id', collection.id)
            .limit(3)

          const bookmarks = data?.map((jb: any) => jb.bookmarks).filter(Boolean) || []
          return { collectionId: collection.id, bookmarks }
        })

        const results = await Promise.all(bookmarkPromises)
        const bookmarksMap: Record<string, Bookmark[]> = {}
        results.forEach(({ collectionId, bookmarks }) => {
          bookmarksMap[collectionId] = bookmarks
        })

        setCollectionBookmarks(bookmarksMap)

        // Cache the results
        collectionsCache.data = {
          collections: collectionsData,
          collectionBookmarks: bookmarksMap
        }
        collectionsCache.timestamp = now
      }

      setLoading(false)
    }
    fetchData()
  }, [])

  // Real-time subscription for bookmark collection changes
  useEffect(() => {
    if (isGuest) return

    const refreshCollections = async () => {
      // Invalidate cache so we get fresh data
      collectionsCache.data = null
      collectionsCache.timestamp = 0

      // Refresh collection data when bookmark collection changes
      const { data: collectionsData } = await supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false })

      if (collectionsData) {
        setCollections(collectionsData)

        // Fetch sample bookmarks for each collection via junction table
        const bookmarkPromises = collectionsData.map(async (collection: Collection) => {
          const { data } = await supabase
            .from('collection_bookmarks')
            .select('bookmark_id, bookmarks(*)')
            .eq('collection_id', collection.id)
            .limit(3)

          const bookmarks = data?.map((jb: any) => jb.bookmarks).filter(Boolean) || []
          return { collectionId: collection.id, bookmarks }
        })

        const results = await Promise.all(bookmarkPromises)
        const bookmarksMap: Record<string, Bookmark[]> = {}
        results.forEach(({ collectionId, bookmarks }) => {
          bookmarksMap[collectionId] = bookmarks
        })

        setCollectionBookmarks(bookmarksMap)
      }
    }

    const channel = supabase
      .channel('bookmarks-collection-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'bookmarks'
        },
        () => {
          refreshCollections()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE on junction table
          schema: 'public',
          table: 'collection_bookmarks'
        },
        () => {
          refreshCollections()
        }
      )
      .subscribe()

    // Polling as backup - refresh every 2 seconds for more responsive updates
    const pollInterval = setInterval(refreshCollections, 2000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [isGuest])

  // Handle URL parameters from extension popup
  useEffect(() => {
    const addUrl = searchParams.get('addUrl')
    const addTitle = searchParams.get('addTitle')

    if (addUrl && collections.length > 0) {
      // Store the bookmark data and open collection selection modal
      setPendingBookmark({
        url: decodeURIComponent(addUrl),
        title: addTitle ? decodeURIComponent(addTitle) : ''
      })
      setSelectCollectionModalOpen(true)

      // Clear URL params
      window.history.replaceState({}, '', '/collections')
    }
  }, [collections.length])

  const createCollection = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isGuest) {
      // Guest mode - save to sessionStorage
      const newCollection: Collection = {
        id: crypto.randomUUID(),
        name: formData.name,
        description: formData.description || null,
        user_id: '',
        is_public: formData.is_public,
        share_slug: formData.name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString()
      }
      const updatedCollections = [...collections, newCollection]
      setCollections(updatedCollections)
      try {
        sessionStorage.setItem('workstack_guest_collections', JSON.stringify(updatedCollections))
      } catch (e) { console.error('Error saving to sessionStorage:', e) }
      setModalOpen(false)
      setFormData({ name: '', description: '', is_public: false })
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const share_slug = formData.name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 9)

    const { data } = await supabase
      .from('collections')
      .insert({
        name: formData.name,
        description: formData.description || null,
        is_public: formData.is_public,
        share_slug,
        user_id: user.id,
      })
      .select()

    if (data) {
      // Invalidate cache
      collectionsCache.data = null
      collectionsCache.timestamp = 0

      setCollections([data[0], ...collections])
      setModalOpen(false)
      setFormData({ name: '', description: '', is_public: false })
    }
  }

  const deleteCollection = async (id: string) => {
    setActionLoading(true)

    if (isGuest) {
      const updatedCollections = collections.filter(c => c.id !== id)
      setCollections(updatedCollections)
      try {
        sessionStorage.setItem('workstack_guest_collections', JSON.stringify(updatedCollections))
      } catch (e) { console.error('Error saving to sessionStorage:', e) }
      setDeleteModalOpen(false)
      setCollectionToDelete(null)
      setActionLoading(false)
      return
    }

    await supabase.from('collections').delete().eq('id', id)

    // Invalidate cache
    collectionsCache.data = null
    collectionsCache.timestamp = 0

    setCollections(collections.filter(c => c.id !== id))
    setDeleteModalOpen(false)
    setCollectionToDelete(null)
    setActionLoading(false)
  }

  const openDeleteModal = (collection: Collection) => {
    setCollectionToDelete(collection)
    setDeleteModalOpen(true)
  }

  const togglePublic = async (collection: Collection) => {
    if (isGuest) {
      const updatedCollections = collections.map(c => c.id === collection.id ? { ...c, is_public: !c.is_public } : c)
      setCollections(updatedCollections)
      try {
        sessionStorage.setItem('workstack_guest_collections', JSON.stringify(updatedCollections))
      } catch (e) { console.error('Error saving to sessionStorage:', e) }
      return
    }
    await supabase.from('collections').update({ is_public: !collection.is_public }).eq('id', collection.id)

    // Invalidate cache
    collectionsCache.data = null
    collectionsCache.timestamp = 0

    setCollections(collections.map(c => c.id === collection.id ? { ...c, is_public: !c.is_public } : c))
  }

  const openEditModal = (collection: Collection) => {
    setEditingCollection(collection)
    setFormData({ name: collection.name, description: collection.description || '', is_public: collection.is_public })
    setEditModalOpen(true)
  }

  const updateCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCollection) return

    if (isGuest) {
      const updatedCollection = { ...editingCollection, name: formData.name, description: formData.description || null, is_public: formData.is_public }
      const updatedCollections = collections.map(c => c.id === editingCollection.id ? updatedCollection : c)
      setCollections(updatedCollections)
      try {
        sessionStorage.setItem('workstack_guest_collections', JSON.stringify(updatedCollections))
      } catch (e) { console.error('Error saving to sessionStorage:', e) }
      setEditModalOpen(false)
      setEditingCollection(null)
      setFormData({ name: '', description: '', is_public: false })
      return
    }

    const { data } = await supabase
      .from('collections')
      .update({
        name: formData.name,
        description: formData.description || null,
        is_public: formData.is_public,
      })
      .eq('id', editingCollection.id)
      .select()
      .single()

    if (data) {
      // Invalidate cache
      collectionsCache.data = null
      collectionsCache.timestamp = 0

      setCollections(collections.map(c => c.id === editingCollection.id ? data : c))
      setEditModalOpen(false)
      setEditingCollection(null)
      setFormData({ name: '', description: '', is_public: false })
    }
  }

  const addToCollection = async (bookmarkId: string, collectionId: string) => {
    if (isGuest) {
      // Update guest bookmarks in sessionStorage
      try {
        const storedBookmarks = sessionStorage.getItem('workstack_guest_bookmarks')
        if (storedBookmarks) {
          const allBookmarks: Bookmark[] = JSON.parse(storedBookmarks)
          const updatedBookmarks = allBookmarks.map(b => b.id === bookmarkId ? { ...b, collection_id: collectionId } : b)
          sessionStorage.setItem('workstack_guest_bookmarks', JSON.stringify(updatedBookmarks))
          setAvailableBookmarks(updatedBookmarks)
          // Update collection bookmarks cache
          const bookmark = updatedBookmarks.find(b => b.id === bookmarkId)
          if (bookmark) {
            setCollectionBookmarks(prev => ({
              ...prev,
              [collectionId]: [bookmark, ...(prev[collectionId] || [])].slice(0, 3)
            }))
          }
        }
      } catch (e) { console.error('Error saving to sessionStorage:', e) }
      setAddModalOpen(false)
      setSelectedCollection(null)
      return
    }

    await supabase.from('bookmarks').update({ collection_id: collectionId }).eq('id', bookmarkId)

    // Invalidate cache
    collectionsCache.data = null
    collectionsCache.timestamp = 0

    // Refresh available bookmarks
    const { data } = await supabase.from('bookmarks').select('*').order('title', { ascending: true })
    if (data) setAvailableBookmarks(data)
    // Update collection bookmarks cache
    const bookmark = data.find((b: Bookmark) => b.id === bookmarkId)
    if (bookmark) {
      setCollectionBookmarks(prev => ({
        ...prev,
        [collectionId]: [bookmark, ...(prev[collectionId] || [])].slice(0, 3)
      }))
    }
    setAddModalOpen(false)
    setSelectedCollection(null)
  }

  const addNewBookmarkToCollection = async (collection: Collection) => {
    if (!pendingBookmark) return

    if (isGuest) {
      // Guest mode - create bookmark in sessionStorage
      try {
        const storedBookmarks = sessionStorage.getItem('workstack_guest_bookmarks')
        let allBookmarks: Bookmark[] = storedBookmarks ? JSON.parse(storedBookmarks) : []

        // Check if bookmark already exists
        const existingBookmark = allBookmarks.find(b => b.url === pendingBookmark.url)

        if (existingBookmark) {
          // Update existing bookmark to this collection
          allBookmarks = allBookmarks.map(b => b.id === existingBookmark.id ? { ...b, collection_id: collection.id } : b)
        } else {
          // Create new bookmark in this collection
          const newBookmark: Bookmark = {
            id: crypto.randomUUID(),
            user_id: '',
            url: pendingBookmark.url,
            title: pendingBookmark.title || new URL(pendingBookmark.url).hostname,
            description: null,
            notes: null,
            is_read: true,
            is_favorite: false,
            collection_id: collection.id,
            folder_id: null,
            favicon_url: null,
            screenshot_url: null,
            last_opened_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          allBookmarks = [newBookmark, ...allBookmarks]
        }

        sessionStorage.setItem('workstack_guest_bookmarks', JSON.stringify(allBookmarks))
        // Refresh collection bookmarks
        const collectionBookmarks = allBookmarks.filter(b => b.collection_id === collection.id).slice(0, 3)
        setCollectionBookmarks(prev => ({ ...prev, [collection.id]: collectionBookmarks }))
      } catch (e) { console.error('Error saving to sessionStorage:', e) }

      setSelectCollectionModalOpen(false)
      setPendingBookmark(null)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Check if bookmark already exists
    const { data: existingBookmark } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('url', pendingBookmark.url)
      .single()

    if (existingBookmark) {
      // Update existing bookmark to this collection
      await supabase.from('bookmarks').update({ collection_id: collection.id }).eq('id', existingBookmark.id)
      // Refresh collection bookmarks
      const { data } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('collection_id', collection.id)
        .order('created_at', { ascending: false })
        .limit(3)
      if (data) {
        setCollectionBookmarks(prev => ({ ...prev, [collection.id]: data }))
      }
    } else {
      // Create new bookmark in this collection
      const { data } = await supabase.from('bookmarks').insert({
        user_id: user.id,
        url: pendingBookmark.url,
        title: pendingBookmark.title || new URL(pendingBookmark.url).hostname,
        collection_id: collection.id,
        is_read: true,
        is_favorite: false,
      }).select().single()
      // Refresh collection bookmarks
      if (data) {
        setCollectionBookmarks(prev => ({
          ...prev,
          [collection.id]: [data, ...(prev[collection.id] || [])].slice(0, 3)
        }))
      }
    }

    // Invalidate cache
    collectionsCache.data = null
    collectionsCache.timestamp = 0

    setSelectCollectionModalOpen(false)
    setPendingBookmark(null)
  }

  const shareUrl = (collection: Collection) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/share/${collection.share_slug}`
    }
    return ''
  }

  return (
    <>
      {/* Search Bar - Full Width */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r={8} strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
        </svg>
        <Input
          placeholder="Search collections by name or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          style={{ paddingRight: '12px' }}
        />
        {isGuest && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(251, 146, 60, 0.2)', color: '#ea580c' }}>
            Guest Mode
          </span>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-2 mb-4 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
              <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="h-6 bg-gray-300 rounded mb-2 w-3/4" />
                <div className="h-4 bg-gray-300 rounded w-1/4 mb-4" />
                <div className="h-4 bg-gray-300 rounded w-1/2 mb-4" />
                <div className="flex gap-2">
                  <div className="h-8 bg-gray-300 rounded flex-1" />
                  <div className="h-8 bg-gray-300 rounded w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            No collections yet. Create your first collection!
          </CardContent>
        </Card>
      ) : (
        <>
          {collections.filter(collection =>
            collection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (collection.description && collection.description.toLowerCase().includes(searchQuery.toLowerCase()))
          ).length === 0 && (
            <Card>
              <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                No collections found matching "{searchQuery}"
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.filter(collection =>
              collection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (collection.description && collection.description.toLowerCase().includes(searchQuery.toLowerCase()))
            ).map(collection => {
            const bookmarks = collectionBookmarks[collection.id] || []
            return (
              <Card
                key={collection.id}
                className="overflow-hidden cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg flex flex-col"
                onClick={() => router.push(`/collections/${collection.id}`)}
                onMouseEnter={() => router.prefetch(`/collections/${collection.id}`)}
              >
                <div className={`h-2 ${collection.is_public ? 'bg-green-500' : 'bg-gray-300'}`} />
                <CardContent className="p-6 flex flex-col flex-grow">
                  <div className="flex-grow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {collection.name}
                        </h3>
                        {collection.description && (
                          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{collection.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(collection); }}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-all duration-75 active:scale-90"
                          style={{ cursor: 'pointer' }}
                          title="Edit collection"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openDeleteModal(collection); }}
                          className="p-1 text-gray-400 hover:text-red-600 transition-all duration-75 active:scale-90"
                          style={{ cursor: 'pointer' }}
                          title="Delete collection"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                      {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
                    </p>

                    <div className="flex gap-2 flex-wrap mb-4">
                      {bookmarks.slice(0, 3).map(b => (
                        <a
                          key={b.id}
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs px-2 py-1 rounded truncate max-w-[120px] block transition-all duration-75 hover:scale-105 active:scale-100"
                          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                          title={b.title}
                        >
                          {b.title}
                        </a>
                      ))}
                      {bookmarks.length > 3 && (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>+{bookmarks.length - 3} more</span>
                      )}
                    </div>
                  </div>

                  {collection.is_public && (
                    <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Share link:</p>
                      <code className="text-xs text-blue-600 break-all">{shareUrl(collection)}</code>
                    </div>
                  )}

                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePublic(collection); }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-75 active:scale-90"
                      style={{
                        backgroundColor: collection.is_public ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-secondary)',
                        color: collection.is_public ? '#15803d' : 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      {collection.is_public ? '🌐 Public' : '🔒 Private'}
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async (e) => {
                        e.stopPropagation()
                        setSelectedCollection(collection)
                        // Fetch available bookmarks on-demand
                        if (isGuest) {
                          try {
                            const storedBookmarks = sessionStorage.getItem('workstack_guest_bookmarks')
                            if (storedBookmarks) {
                              setAvailableBookmarks(JSON.parse(storedBookmarks))
                            }
                          } catch (e) { console.error('Error loading guest bookmarks:', e) }
                        } else {
                          const { data } = await supabase
                            .from('bookmarks')
                            .select('*')
                            .order('title', { ascending: true })
                          if (data) setAvailableBookmarks(data)
                        }
                        setAddModalOpen(true)
                      }}
                    >
                      + Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
        </>
      )}

      {/* Create Collection Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Collection">
        <form onSubmit={createCollection} className="space-y-4">
          <Input
            label="Collection Name"
            placeholder="My Favorite Articles"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Textarea
            label="Description (optional)"
            placeholder="A collection of useful resources"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_public}
              onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">Make public (shareable)</span>
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">Create Collection</Button>
          </div>
        </form>
      </Modal>

      {/* Add to Collection Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Bookmark">
        {selectedCollection && (
          <div className="space-y-4">
            <p style={{ color: 'var(--text-secondary)' }}>
              Select a bookmark to add to <strong>{selectedCollection.name}</strong>
            </p>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {availableBookmarks.filter(b => b.collection_id !== selectedCollection.id).map(bookmark => (
                <button
                  key={bookmark.id}
                  onClick={() => addToCollection(bookmark.id, selectedCollection.id)}
                  className="w-full text-left p-3 rounded-lg transition-all duration-75 active:scale-98"
                  style={{ color: 'var(--text-primary)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{bookmark.title}</p>
                  <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
                </button>
              ))}
              {availableBookmarks.filter(b => b.collection_id !== selectedCollection.id).length === 0 && (
                <p style={{ color: 'var(--text-secondary)' }} className="text-center py-4">No bookmarks available</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Collection Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Collection">
        <form onSubmit={updateCollection} className="space-y-4">
          <Input
            label="Collection Name"
            placeholder="My Favorite Articles"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Textarea
            label="Description (optional)"
            placeholder="A collection of useful resources"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_public}
              onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
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

      {/* Select Collection Modal (for adding new bookmark from extension) */}
      <Modal isOpen={selectCollectionModalOpen} onClose={() => { setSelectCollectionModalOpen(false); setPendingBookmark(null); }} title="Select Collection">
        {pendingBookmark && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Adding:</p>
              <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{pendingBookmark.title || pendingBookmark.url}</p>
              <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{pendingBookmark.url}</p>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>Select a collection to add this bookmark to:</p>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {collections.map(collection => (
                <button
                  key={collection.id}
                  onClick={() => addNewBookmarkToCollection(collection)}
                  className="w-full text-left p-4 rounded-lg transition-all duration-75 active:scale-98 border"
                  style={{
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    backgroundColor: collection.is_public ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-secondary)',
                    borderColor: collection.is_public ? '#22c55e' : 'var(--border-color)'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{collection.name}</p>
                      {collection.description && (
                        <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{collection.description}</p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full" style={{
                      backgroundColor: collection.is_public ? 'rgba(34, 197, 94, 0.2)' : 'rgba(156, 163, 175, 0.2)',
                      color: collection.is_public ? '#15803d' : '#6b7280'
                    }}>
                      {collection.is_public ? '🌐 Public' : '🔒 Private' }
                    </span>
                  </div>
                </button>
              ))}
              {collections.length === 0 && (
                <p style={{ color: 'var(--text-secondary)' }} className="text-center py-4">No collections available. Create one first!</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Hidden button for programmatic clicks */}
      <button
        id="add-collection-btn"
        onClick={() => setModalOpen(true)}
        style={{ display: 'none' }}
      />

      {/* Delete Collection Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Collection">
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to delete <strong>"{collectionToDelete?.name}"</strong>?
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Bookmarks in this collection will be unassigned but not deleted.
          </p>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteModalOpen(false)}
              className="flex-1"
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => collectionToDelete && deleteCollection(collectionToDelete.id)}
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={actionLoading}
            >
              {actionLoading ? 'Deleting...' : 'Delete Collection'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
