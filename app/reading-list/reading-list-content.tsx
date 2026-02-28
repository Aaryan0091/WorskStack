'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/input'
import type { Bookmark } from '@/lib/types'
import {
  guestStoreGet,
  guestStoreSet,
  GUEST_KEYS,
  markGuestMode
} from '@/lib/guest-storage'

// Helper function to format time since creation
function formatTimeSince(dateString: string): string {
  const now = new Date()
  const created = new Date(dateString)
  const diffMs = now.getTime() - created.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Added today'
  if (diffDays === 1) return 'Added yesterday'
  if (diffDays < 7) return `Added ${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `Added ${weeks} week${weeks > 1 ? 's' : ''} ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `Added ${months} month${months > 1 ? 's' : ''} ago`
  }
  const years = Math.floor(diffDays / 365)
  return `Added ${years} year${years > 1 ? 's' : ''} ago`
}

// Check if bookmark is more than a week old and never opened
function isOldNeverOpened(bookmark: Bookmark): boolean {
  if (bookmark.last_opened_at) return false
  const now = new Date()
  const created = new Date(bookmark.created_at)
  const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays >= 7
}

export function ReadingListContent() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [neverOpened, setNeverOpened] = useState<Bookmark[]>([])
  const [semanticallyRelated, setSemanticallyRelated] = useState<Bookmark[]>([])
  const [suggestions, setSuggestions] = useState<Bookmark[]>([])
  const [showNeverOpened, setShowNeverOpened] = useState(true)
  const [showSemantic, setShowSemantic] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [loadingSemantic, setLoadingSemantic] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null)
  const [isGuest, setIsGuest] = useState(false)

  // Load saved visibility states from localStorage
  useEffect(() => {
    const savedSemantic = localStorage.getItem('workstack_show_semantic')
    const savedSuggestions = localStorage.getItem('workstack_show_suggestions')
    if (savedSemantic !== null) setShowSemantic(savedSemantic === 'true')
    if (savedSuggestions !== null) setShowSuggestions(savedSuggestions === 'true')
  }, [])

  // Save visibility states to localStorage when they change
  useEffect(() => {
    localStorage.setItem('workstack_show_semantic', String(showSemantic))
  }, [showSemantic])

  useEffect(() => {
    localStorage.setItem('workstack_show_suggestions', String(showSuggestions))
  }, [showSuggestions])

  useEffect(() => {
    const fetchData = async () => {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Guest mode - load from localStorage
        setIsGuest(true)
        markGuestMode()
        try {
          const storedBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS) || []
          if (storedBookmarks.length > 0) {
            const readingList = storedBookmarks.filter((b: Bookmark) => !b.is_read)
            setBookmarks(readingList)
            setNeverOpened(readingList.filter(isOldNeverOpened))
            setSuggestions(storedBookmarks.filter((b: Bookmark) => b.is_read).slice(0, 6))
          }
        } catch (e) {
          console.error('Error loading guest data:', e)
        }
        return
      }

      // Fetch bookmarks that are in the reading list (is_read = false)
      const { data: readingList } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })

      if (readingList) {
        setBookmarks(readingList)
        // Filter for never opened AND more than a week old
        setNeverOpened(readingList.filter(isOldNeverOpened))
      }

      // Fetch suggestions - bookmarks that are read but could be re-added (most recent)
      const { data: readBookmarks } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', true)
        .order('created_at', { ascending: false })
        .limit(6)

      if (readBookmarks) {
        setSuggestions(readBookmarks)
      }

      // Fetch semantic recommendations
      await fetchSemanticRecommendations()
    }
    fetchData()
  }, [])

  const fetchSemanticRecommendations = async () => {
    setLoadingSemantic(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      // Try different possible locations for the token
      const token = session?.access_token

      if (!token) {
        setLoadingSemantic(false)
        return
      }

      const response = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setSemanticallyRelated(data.recommendations || [])
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error)
    } finally {
      setLoadingSemantic(false)
    }
  }

  // Track bookmark open - only marks as opened, NOT as read
  const handleBookmarkOpen = async (bookmark: Bookmark) => {
    // Get auth token - try multiple methods
    const { data: { session } } = await supabase.auth.getSession()

    // Try different possible locations for the token
    let token = session?.access_token

    // If still no token, try getting from current session
    if (!token) {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      token = currentSession?.access_token
    }

    if (!token) {
      return
    }

    fetch(`/api/bookmarks/${bookmark.id}/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    .then((response) => {
      if (response.ok) {
        // On successful open, update the bookmark locally with last_opened_at
        // This will remove it from neverOpened since isOldNeverOpened checks for last_opened_at
        setBookmarks(prev => prev.map(b =>
          b.id === bookmark.id
            ? { ...b, last_opened_at: new Date().toISOString() }
            : b
        ))
        // Remove from neverOpened state immediately
        setNeverOpened(prev => prev.filter(b => b.id !== bookmark.id))
      }
    })
    .catch(console.error)

    // Optimistically remove from neverOpened state immediately for better UX
    setNeverOpened(prev => prev.filter(b => b.id !== bookmark.id))
  }

  const toggleRead = async (bookmark: Bookmark) => {
    // Remove from reading list (set is_read = true)
    if (isGuest) {
      try {
        const storedBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
        if (storedBookmarks) {
          const updatedBookmarks = storedBookmarks.map((b: Bookmark) => b.id === bookmark.id ? { ...b, is_read: true } : b)
          guestStoreSet(GUEST_KEYS.BOOKMARKS, updatedBookmarks)
        }
      } catch (e) { console.error('Error saving to localStorage:', e) }
      setBookmarks(prev => prev.filter((b: Bookmark) => b.id !== bookmark.id))
      setNeverOpened(prev => prev.filter((b: Bookmark) => b.id !== bookmark.id))
      setSuggestions(prev => [{ ...bookmark, is_read: true }, ...prev])
      return
    }
    await supabase.from('bookmarks').update({ is_read: true }).eq('id', bookmark.id)
    setBookmarks(prev => prev.filter(b => b.id !== bookmark.id))
    setNeverOpened(prev => prev.filter(b => b.id !== bookmark.id))
    // Add back to suggestions immediately
    setSuggestions(prev => [{ ...bookmark, is_read: true }, ...prev])
  }

  // Never opened count matches the neverOpened state length
  const neverOpenedCount = neverOpened.length

  const addToReadingList = async (bookmark: Bookmark) => {
    // Add to reading list (set is_read = false)
    if (isGuest) {
      try {
        const storedBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
        if (storedBookmarks) {
          const updatedBookmarks = storedBookmarks.map((b: Bookmark) => b.id === bookmark.id ? { ...b, is_read: false } : b)
          guestStoreSet(GUEST_KEYS.BOOKMARKS, updatedBookmarks)
        }
      } catch (e) { console.error('Error saving to localStorage:', e) }
      setBookmarks(prev => [{ ...bookmark, is_read: false }, ...prev])
      setSuggestions(prev => prev.filter((b: Bookmark) => b.id !== bookmark.id))
      setSemanticallyRelated(prev => prev.filter((b: Bookmark) => b.id !== bookmark.id))
      return
    }
    await supabase.from('bookmarks').update({ is_read: false }).eq('id', bookmark.id)
    // Update the bookmark object to reflect is_read: false before adding to state
    setBookmarks(prev => [{ ...bookmark, is_read: false }, ...prev])
    setSuggestions(prev => prev.filter((b: Bookmark) => b.id !== bookmark.id))
    setSemanticallyRelated(prev => prev.filter(b => b.id !== bookmark.id))
  }

  const updateNotes = async (bookmark: Bookmark, notes: string) => {
    if (isGuest) {
      try {
        const storedBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
        if (storedBookmarks) {
          const updatedBookmarks = storedBookmarks.map((b: Bookmark) => b.id === bookmark.id ? { ...b, notes } : b)
          guestStoreSet(GUEST_KEYS.BOOKMARKS, updatedBookmarks)
          setBookmarks(prev => prev.map((b: Bookmark) => b.id === bookmark.id ? { ...b, notes } : b))
        }
      } catch (e) { console.error('Error saving to localStorage:', e) }
      setModalOpen(false)
      return
    }
    await supabase.from('bookmarks').update({ notes }).eq('id', bookmark.id)
    setBookmarks(prev => prev.map((b: Bookmark) => b.id === bookmark.id ? { ...b, notes } : b))
    setModalOpen(false)
  }

  const openNotesModal = (bookmark: Bookmark) => {
    setSelectedBookmark(bookmark)
    setModalOpen(true)
  }

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{bookmarks.length}</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Items in Reading List</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{neverOpenedCount}</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Never Opened (1+ week)</p>
          </CardContent>
        </Card>
      </div>

      {/* Guest Mode Warning */}
      {isGuest && (
        <div className="p-3 rounded-lg text-sm flex items-center justify-between" style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>
          <span style={{ color: '#ea580c' }}>⚠️ Guest mode: Your reading list will be lost when you close the browser.</span>
          <a href="/login" className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">Sign in to save</a>
        </div>
      )}

      {/* All Reading List Items */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            📖 Reading List ({bookmarks.length})
          </h2>
        </div>
        {bookmarks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              Your reading list is empty. Click the book icon on any bookmark to add it here!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {bookmarks.map(bookmark => (
              <Card key={bookmark.id}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div className="relative group">
                      <button
                        onClick={() => toggleRead(bookmark)}
                        className="mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-75 active:scale-90 flex-shrink-0 bg-blue-500 border-blue-500 text-white"
                        style={{ cursor: 'pointer' }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white whitespace-nowrap rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" style={{ backgroundColor: '#1f2937' }}>
                        Remove from reading list
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:text-blue-600"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => handleBookmarkOpen(bookmark)}
                      >
                        {bookmark.title}
                      </a>
                      <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
                      {bookmark.description && (
                        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{bookmark.description}</p>
                      )}
                      {bookmark.notes && (
                        <div className="mt-2 p-2 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                          📝 {bookmark.notes}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => openNotesModal(bookmark)}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-all duration-75 active:scale-90"
                      title="Add notes"
                      style={{ cursor: 'pointer' }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Never Opened Section */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            <span className="mr-2">🆕</span>Never Opened ({neverOpenedCount})
          </h2>
          <button
            onClick={() => setShowNeverOpened(!showNeverOpened)}
            className="text-sm px-3 py-1 rounded-lg transition-all cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            {showNeverOpened ? 'Hide' : 'Show'}
          </button>
        </div>
        {showNeverOpened && (
          neverOpened.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                No items that were never opened for over a week. Great job staying on top of your reading list!
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {neverOpened.map(bookmark => (
                <Card key={bookmark.id}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="relative group">
                        <button
                          onClick={() => toggleRead(bookmark)}
                          className="mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-75 active:scale-90 flex-shrink-0 bg-blue-500 border-blue-500 text-white"
                          style={{ cursor: 'pointer' }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white whitespace-nowrap rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" style={{ backgroundColor: '#1f2937' }}>
                          Remove from reading list
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <a
                          href={bookmark.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:text-blue-600"
                          style={{ color: 'var(--text-primary)' }}
                          onClick={() => handleBookmarkOpen(bookmark)}
                        >
                          {bookmark.title}
                        </a>
                        <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
                        {bookmark.description && (
                          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{bookmark.description}</p>
                        )}
                        {bookmark.notes && (
                          <div className="mt-2 p-2 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                            📝 {bookmark.notes}
                          </div>
                        )}
                        <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                          {formatTimeSince(bookmark.created_at)}
                        </p>
                      </div>

                      <button
                        onClick={() => openNotesModal(bookmark)}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-all duration-75 active:scale-90"
                        title="Add notes"
                        style={{ cursor: 'pointer' }}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Semantically Related Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            <span className="mr-2">🧠</span>Semantically Related {loadingSemantic ? '(Loading...)' : `(${semanticallyRelated.length})`}
          </h2>
          <button
            onClick={() => setShowSemantic(!showSemantic)}
            className="text-sm px-3 py-1 rounded-lg transition-all cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            {showSemantic ? 'Hide' : 'Show'}
          </button>
        </div>
        {showSemantic && (
          semanticallyRelated.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                {loadingSemantic
                  ? 'Analyzing your reading list to find related content...'
                  : bookmarks.length === 0
                    ? 'Add items to your reading list to get AI-powered recommendations!'
                    : 'No related content found. Try adding more bookmarks to your collection.'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {semanticallyRelated.map(bookmark => (
                <Card key={bookmark.id} className="hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
                  <CardContent className="p-4">
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
                    <button
                      onClick={() => addToReadingList(bookmark)}
                      className="mt-3 w-full px-4 py-2 rounded-lg text-sm font-medium transition-all duration-75 active:scale-95 flex items-center justify-center gap-2"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add to Reading List
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Suggestions Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            📚 Suggested for Reading List ({suggestions.length})
          </h2>
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="text-sm px-3 py-1 rounded-lg transition-all cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            {showSuggestions ? 'Hide' : 'Show'}
          </button>
        </div>
        {showSuggestions && (
          suggestions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                No suggestions yet. As you read and mark items as complete, they&apos;ll appear here for you to rediscover.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestions.map(bookmark => (
                <Card key={bookmark.id} className="hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
                  <CardContent className="p-4">
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
                    <button
                      onClick={() => addToReadingList(bookmark)}
                      className="mt-3 w-full px-4 py-2 rounded-lg text-sm font-medium transition-all duration-75 active:scale-95 flex items-center justify-center gap-2"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add to Reading List
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Notes Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Notes">
        {selectedBookmark && (
          <form onSubmit={(e) => { e.preventDefault(); updateNotes(selectedBookmark, selectedBookmark.notes || '') }}>
            <Textarea
              placeholder="Add your notes, highlights, or thoughts..."
              value={selectedBookmark.notes || ''}
              onChange={(e) => setSelectedBookmark({ ...selectedBookmark, notes: e.target.value })}
              rows={6}
            />
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg flex-1"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg flex-1 bg-blue-600 text-white"
                style={{ cursor: 'pointer' }}
              >
                Save Notes
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
