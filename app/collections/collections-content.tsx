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

export function CollectionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collections, setCollections] = useState<Collection[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_public: false,
  })

  useEffect(() => {
    const fetchData = async () => {
      const [collectionsRes, bookmarksRes] = await Promise.all([
        supabase.from('collections').select('*').order('created_at', { ascending: false }),
        supabase.from('bookmarks').select('*').order('title', { ascending: true }),
      ])
      if (collectionsRes.data) setCollections(collectionsRes.data)
      if (bookmarksRes.data) setBookmarks(bookmarksRes.data)
    }
    fetchData()
  }, [])

  // Handle URL parameters from extension popup
  useEffect(() => {
    const addUrl = searchParams.get('addUrl')
    const addTitle = searchParams.get('addTitle')

    if (addUrl && collections.length > 0) {
      // Open add modal with first collection selected
      setSelectedCollection(collections[0])
      setAddModalOpen(true)

      // Clear URL params
      window.history.replaceState({}, '', '/collections')
    }
  }, [collections.length])

  const createCollection = async (e: React.FormEvent) => {
    e.preventDefault()
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
      setCollections([data[0], ...collections])
      setModalOpen(false)
      setFormData({ name: '', description: '', is_public: false })
    }
  }

  const deleteCollection = async (id: string) => {
    if (!confirm('Delete this collection? Bookmarks will be unassigned.')) return
    await supabase.from('collections').delete().eq('id', id)
    setCollections(collections.filter(c => c.id !== id))
  }

  const togglePublic = async (collection: Collection) => {
    await supabase.from('collections').update({ is_public: !collection.is_public }).eq('id', collection.id)
    setCollections(collections.map(c => c.id === collection.id ? { ...c, is_public: !c.is_public } : c))
  }

  const addToCollection = async (bookmarkId: string, collectionId: string) => {
    await supabase.from('bookmarks').update({ collection_id: collectionId }).eq('id', bookmarkId)
    const { data } = await supabase.from('bookmarks').select('*').order('title', { ascending: true })
    if (data) setBookmarks(data)
    setAddModalOpen(false)
    setSelectedCollection(null)
  }

  const getCollectionBookmarks = (collectionId: string) => {
    return bookmarks.filter(b => b.collection_id === collectionId)
  }

  const shareUrl = (collection: Collection) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/share/${collection.share_slug}`
    }
    return ''
  }

  return (
    <>
      {collections.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            No collections yet. Create your first collection!
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map(collection => {
            const collectionBookmarks = getCollectionBookmarks(collection.id)
            return (
              <Card key={collection.id} className="overflow-hidden cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg">
                <div className={`h-2 ${collection.is_public ? 'bg-green-500' : 'bg-gray-300'}`} />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {collection.name}
                      </h3>
                      {collection.description && (
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{collection.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteCollection(collection.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-all duration-75 active:scale-90"
                      style={{ cursor: 'pointer' }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    {collectionBookmarks.length} bookmark{collectionBookmarks.length !== 1 ? 's' : ''}
                  </p>

                  <div className="flex gap-2 flex-wrap mb-4">
                    {collectionBookmarks.slice(0, 3).map(b => (
                      <a
                        key={b.id}
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 rounded truncate max-w-[120px] block transition-all duration-75 hover:scale-105 active:scale-100"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        title={b.title}
                      >
                        {b.title}
                      </a>
                    ))}
                    {collectionBookmarks.length > 3 && (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>+{collectionBookmarks.length - 3} more</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => togglePublic(collection)}
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
                      onClick={() => { setSelectedCollection(collection); setAddModalOpen(true); }}
                    >
                      + Add
                    </Button>
                  </div>

                  {collection.is_public && (
                    <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Share link:</p>
                      <code className="text-xs text-blue-600 break-all">{shareUrl(collection)}</code>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
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
              {bookmarks.filter(b => b.collection_id !== selectedCollection.id).map(bookmark => (
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
              {bookmarks.filter(b => b.collection_id !== selectedCollection.id).length === 0 && (
                <p style={{ color: 'var(--text-secondary)' }} className="text-center py-4">No bookmarks available</p>
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
    </>
  )
}
