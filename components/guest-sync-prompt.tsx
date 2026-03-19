'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'
import type { Bookmark, Collection } from '@/lib/types'
import {
  markUserSignedIn,
  guestStoreGet,
  GUEST_KEYS,
  clearGuestData,
  isGuestMode
} from '@/lib/guest-storage'

const SYNC_SHOWN_KEY = 'workstack_sync_prompt_shown'

export function GuestSyncPrompt() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ bookmarks: number; collections: number } | null>(null)
  const [hasGuestData, setHasGuestData] = useState(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [])

  useEffect(() => {
    // Check if user is logged in and has guest data
    const checkGuestData = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      // Only show if user is logged in
      if (!session?.user) {
        return
      }

      // Check if we already showed the prompt
      const alreadyShown = localStorage.getItem(SYNC_SHOWN_KEY)
      if (alreadyShown) {
        return
      }

      // Only show if user was actually in guest mode before
      // This prevents showing the popup for brand new accounts or when
      // old guest data exists from a different session
      if (!isGuestMode()) {
        return
      }

      // Check for guest data using localStorage
      const guestBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
      const guestCollections = guestStoreGet<Collection[]>(GUEST_KEYS.COLLECTIONS)

      const bookmarks = guestBookmarks || []
      const collections = guestCollections || []

      // Only show if there's actual guest data
      if ((bookmarks.length > 0 || collections.length > 0)) {
        setHasGuestData(true)
        setIsOpen(true)
      }
    }

    checkGuestData()
  }, [])

  const handleSync = async () => {
    setSyncing(true)

    try {
      const guestBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
      const guestCollections = guestStoreGet<Collection[]>(GUEST_KEYS.COLLECTIONS)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setSyncing(false)
        return
      }

      const response = await fetch('/api/sync-guest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          guestBookmarks: guestBookmarks || [],
          guestCollections: guestCollections || [],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setSyncResult(data.synced)

        // Mark user as signed in so their data won't be cleared on close
        markUserSignedIn()

        // Clear all guest data
        clearGuestData()

        // Mark that we showed the prompt
        localStorage.setItem(SYNC_SHOWN_KEY, 'true')

        // Close modal after a delay to show success
        syncTimerRef.current = setTimeout(() => {
          setIsOpen(false)
          router.refresh()
        }, 2000)
      }
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setSyncing(false)
    }
  }

  const handleDismiss = () => {
    // Mark that we showed the prompt so we don't show it again
    localStorage.setItem(SYNC_SHOWN_KEY, 'true')
    setIsOpen(false)
  }

  if (!hasGuestData) return null

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="">
      <div className="space-y-5">
        {/* Header with icon */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3" style={{
            backgroundColor: 'var(--color-primary)'
          }}>
            <span className="text-3xl">📦</span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Sync Your Data?</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            We found bookmarks or collections from your guest session
          </p>
        </div>

        {/* Info box */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Your guest session data will be lost when you close the browser. Would you like to save it to your account now?
          </p>
        </div>

        {/* Success message */}
        {syncResult && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            <p className="text-sm text-center" style={{ color: '#15803d' }}>
              ✓ Synced {syncResult.bookmarks} bookmark{syncResult.bookmarks !== 1 ? 's' : ''} and {syncResult.collections} collection{syncResult.collections !== 1 ? 's' : ''}!
            </p>
          </div>
        )}

        {/* Buttons */}
        {!syncResult && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDismiss}
              disabled={syncing}
              type="button"
              className="flex-1 px-4 py-3 rounded-lg font-medium transition-all active:scale-95"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              No Thanks
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              type="button"
              className="flex-1 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--color-primary)', color: 'white', cursor: 'pointer' }}
            >
              {syncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <span>Sync Data</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
