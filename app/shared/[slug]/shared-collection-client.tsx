'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { Bookmark, Collection } from '@/lib/types'
import { guestStoreSet, guestStoreGet, GUEST_KEYS, markGuestMode } from '@/lib/guest-storage'
import { generateUUID, generateShortId } from '@/lib/utils'

interface SharedCollectionClientProps {
  collection: Collection
  bookmarks: Bookmark[]
}

export function SharedCollectionClient({ collection, bookmarks: initialBookmarks }: SharedCollectionClientProps) {
  const router = useRouter()
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Check if this collection is already saved
  const [isSaved, setIsSaved] = useState(false)

  const saveToMyCollections = async () => {
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Guest mode - save to localStorage
        markGuestMode()

        // Check if already saved
        const savedCollections: Collection[] = guestStoreGet(GUEST_KEYS.COLLECTIONS) || []
        const alreadyExists = savedCollections.some(c => c.name === `${collection.name} (Copy)`)

        if (alreadyExists) {
          setToast({ message: 'Collection already saved!', type: 'error' })
          setTimeout(() => setToast(null), 2000)
          setSaving(false)
          return
        }

        // Create a copy of the collection
        const newCollection: Collection = {
          id: generateUUID(),
          user_id: '',
          name: `${collection.name} (Copy)`,
          description: collection.description,
          is_public: false,
          share_slug: `my-collection-${generateUUID().substr(0, 8)}`,
          share_code: Math.random().toString(36).substring(2, 10),
          created_at: new Date().toISOString()
        }

        // Create copies of all bookmarks
        const newBookmarks: Bookmark[] = initialBookmarks.map(bookmark => ({
          ...bookmark,
          id: generateUUID(),
          user_id: '',
          collection_id: newCollection.id,
          created_at: new Date().toISOString()
        }))

        // Save to localStorage
        const updatedCollections = [...savedCollections, newCollection]
        guestStoreSet(GUEST_KEYS.COLLECTIONS, updatedCollections)

        // Merge with existing bookmarks
        const existingBookmarks: Bookmark[] = guestStoreGet(GUEST_KEYS.BOOKMARKS) || []
        const allBookmarks = [...newBookmarks, ...existingBookmarks]
        guestStoreSet(GUEST_KEYS.BOOKMARKS, allBookmarks)

        setSaved(true)
        setIsSaved(true)
        setToast({ message: 'Collection saved!', type: 'success' })
        setTimeout(() => setToast(null), 2000)
        setTimeout(() => {
          setSaveModalOpen(false)
          router.push('/collections')
        }, 1500)
      } else {
        // Logged in - save to database
        // Check if user already has a collection with this name
        const { data: existing } = await supabase
          .from('collections')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', `${collection.name} (Copy)`)
          .single()

        if (existing) {
          setToast({ message: 'Collection already saved!', type: 'error' })
          setTimeout(() => setToast(null), 2000)
          setSaving(false)
          return
        }

        // Create a new collection for the user
        const { data: newCollection, error: collectionError } = await supabase
          .from('collections')
          .insert({
            user_id: user.id,
            name: `${collection.name} (Copy)`,
            description: collection.description,
            is_public: false,
            share_slug: `my-collection-${generateUUID().substr(0, 8)}`
          })
          .select()
          .single()

        if (collectionError || !newCollection) {
          throw collectionError || new Error('Failed to create collection')
        }

        // Create bookmarks for the user
        const bookmarksToCreate = initialBookmarks.map(bookmark => ({
          user_id: user.id,
          url: bookmark.url,
          title: bookmark.title,
          description: bookmark.description,
          notes: bookmark.notes,
          is_read: bookmark.is_read,
          is_favorite: bookmark.is_favorite,
          collection_id: newCollection.id
        }))

        const { error: bookmarksError } = await supabase
          .from('bookmarks')
          .insert(bookmarksToCreate)

        if (bookmarksError) {
          throw bookmarksError
        }

        setSaved(true)
        setIsSaved(true)
        setToast({ message: 'Collection saved!', type: 'success' })
        setTimeout(() => setToast(null), 2000)
        setTimeout(() => {
          setSaveModalOpen(false)
          router.push('/collections')
        }, 1500)
      }
    } catch (error) {
      console.error('Error saving collection:', error)
      setToast({ message: 'Failed to save collection', type: 'error' })
      setTimeout(() => setToast(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📦</span>
              <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {collection.name}
              </h1>
              <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#16a34a' }}>
                🌐 Public
              </span>
            </div>
            <button
              onClick={() => setSaveModalOpen(true)}
              disabled={isSaved || saving}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isSaved ? 'rgba(34, 197, 94, 0.2)' : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                color: isSaved ? '#16a34a' : 'white',
                cursor: isSaved ? 'default' : 'pointer'
              }}
            >
              {isSaved ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Save to My Collections
                </>
              )}
            </button>
          </div>
          {collection.description && (
            <p style={{ color: 'var(--text-secondary)' }}>{collection.description}</p>
          )}
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            {initialBookmarks.length} bookmark{initialBookmarks.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Bookmarks */}
        {initialBookmarks.length === 0 ? (
          <div className="text-center py-16">
            <p style={{ color: 'var(--text-secondary)' }}>No bookmarks in this collection yet.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {initialBookmarks.map((bookmark) => (
              <Card key={bookmark.id} className="hover:shadow-lg transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Favicon */}
                    <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`}
                        className="w-10 h-10"
                        alt=""
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-lg hover:underline block"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {bookmark.title || new URL(bookmark.url).hostname}
                      </a>
                      <p className="text-sm mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {bookmark.url}
                      </p>
                      {bookmark.description && (
                        <p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          {bookmark.description}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                    >
                      Open
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Save Confirmation Modal */}
      <Modal isOpen={saveModalOpen} onClose={() => setSaveModalOpen(false)} title="Save to My Collections">
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }}>
            This will create a copy of <strong>&ldquo;{collection.name}&rdquo;</strong> ({initialBookmarks.length} bookmarks) in your collections.
            You can then edit it however you want without affecting the original.
          </p>
          {saved ? (
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e' }}>
              <p style={{ color: '#16a34a' }}>Collection saved! Redirecting to your collections...</p>
            </div>
          ) : (
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSaveModalOpen(false)}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveToMyCollections}
                disabled={saving}
                className="flex-1"
                style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', color: 'white' }}
              >
                {saving ? 'Saving...' : 'Save Collection'}
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
