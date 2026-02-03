'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Bookmark, Collection } from '@/lib/types'

type SearchMode = 'all' | 'semantic' | 'tags' | 'name'

interface BookmarkWithTags extends Bookmark {
  bookmark_tags?: Array<{
    tags: { id: string; name: string; color: string }
  }>
  collections?: Collection | null
}

export default function SmartSearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('all')
  const [results, setResults] = useState<BookmarkWithTags[]>([])
  const [loading, setLoading] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollection, setSelectedCollection] = useState<string>('')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [allBookmarks, setAllBookmarks] = useState<BookmarkWithTags[]>([])
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load collections and all bookmarks on mount
  useEffect(() => {
    const loadData = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: collectionsData } = await supabase.from('collections').select('*').order('name')
      if (collectionsData) setCollections(collectionsData)

      // Fetch user's bookmarks with tags
      const { data: bookmarksData } = await supabase
        .from('bookmarks')
        .select(`
          *,
          collections (id, name),
          bookmark_tags (
            tags (
              id,
              name,
              color
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (bookmarksData) {
        setAllBookmarks(bookmarksData as BookmarkWithTags[])
        setResults(bookmarksData as BookmarkWithTags[])
      }
    }
    loadData()

    // Check if AI is enabled
    fetch('/api/ai/suggest-tags')
      .then((res) => res.json())
      .then((data) => setAiEnabled(data.enabled))
      .catch(() => setAiEnabled(false))
  }, [])

  // Get tags for a bookmark (moved before search functions)
  const getBookmarkTags = useCallback((bookmark: BookmarkWithTags) => {
    return bookmark.bookmark_tags?.map((bt) => bt.tags).filter(Boolean) || []
  }, [])

  // Client-side search for instant results
  const clientSideSearch = useCallback((searchQuery: string) => {
    const q = searchQuery.toLowerCase().trim()

    if (!q) {
      return allBookmarks
    }

    // Filter by collection first if selected
    let filtered = allBookmarks
    if (selectedCollection) {
      filtered = filtered.filter(b => b.collection_id === selectedCollection)
    }

    // Then search based on mode
    return filtered.filter(bookmark => {
      const title = (bookmark.title || '').toLowerCase()
      const url = bookmark.url.toLowerCase()
      const description = (bookmark.description || '').toLowerCase()
      const tags = getBookmarkTags(bookmark).map(t => t.name.toLowerCase())

      switch (mode) {
        case 'name':
          return title.includes(q) || url.includes(q)
        case 'tags':
          return tags.some(t => t.includes(q))
        case 'all':
          return title.includes(q) || url.includes(q) || description.includes(q) || tags.some(t => t.includes(q))
        default:
          return title.includes(q) || url.includes(q)
      }
    })
  }, [allBookmarks, selectedCollection, mode, getBookmarkTags])

  // API search for semantic mode
  const semanticSearch = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim()
    if (!q) {
      setResults(allBookmarks)
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.session?.access_token

      const response = await fetch('/api/ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: q,
          mode: 'semantic',
          collection_id: selectedCollection || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [allBookmarks, selectedCollection])

  // Instant search effect - runs immediately when query, mode, or collection changes
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // If query is empty, immediately show all bookmarks
    if (!query.trim()) {
      let filtered = allBookmarks
      if (selectedCollection) {
        filtered = allBookmarks.filter(b => b.collection_id === selectedCollection)
      }
      setResults(filtered)
      setLoading(false)
      return
    }

    // For non-semantic modes, do instant client-side search (no debounce needed)
    if (mode !== 'semantic') {
      setResults(clientSideSearch(query))
      setLoading(false)
      return
    }

    // For semantic mode, use debounced API search
    setLoading(true)
    searchTimeoutRef.current = setTimeout(() => {
      semanticSearch(query)
    }, 300)

    // Cleanup function
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query, mode, selectedCollection, allBookmarks, clientSideSearch, semanticSearch])

  // Open bookmark
  const openBookmark = (url: string) => {
    window.open(url, '_blank')
  }

  // Get domain from URL
  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            AI Smart Search
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Search your bookmarks using AI-powered semantic understanding
          </p>
        </div>

        {/* Search Box */}
        <div className="rounded-xl shadow-lg p-6 mb-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {/* Search Input */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for anything... (try 'car' to find 'ferrari')"
                className="w-full px-4 py-3 pr-12 rounded-lg border focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg" style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
                {loading ? (
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Collection Filter */}
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="px-4 py-3 rounded-lg border focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">All Collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Mode Tabs */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setMode('all')}
              className={`px-4 py-2 rounded-lg transition-all ${
                mode === 'all' ? 'ring-2' : ''
              }`}
              style={{
                backgroundColor: mode === 'all' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: mode === 'all' ? 'white' : 'var(--text-primary)',
              }}
            >
              All
            </button>
            <button
              onClick={() => setMode('semantic')}
              disabled={!aiEnabled}
              className={`px-4 py-2 rounded-lg transition-all disabled:opacity-50 ${
                mode === 'semantic' ? 'ring-2' : ''
              }`}
              style={{
                backgroundColor: mode === 'semantic' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: mode === 'semantic' ? 'white' : 'var(--text-primary)',
              }}
            >
              🤖 Semantic AI
            </button>
            <button
              onClick={() => setMode('tags')}
              className={`px-4 py-2 rounded-lg transition-all ${
                mode === 'tags' ? 'ring-2' : ''
              }`}
              style={{
                backgroundColor: mode === 'tags' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: mode === 'tags' ? 'white' : 'var(--text-primary)',
              }}
            >
              🏷️ Tags
            </button>
            <button
              onClick={() => setMode('name')}
              className={`px-4 py-2 rounded-lg transition-all ${
                mode === 'name' ? 'ring-2' : ''
              }`}
              style={{
                backgroundColor: mode === 'name' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: mode === 'name' ? 'white' : 'var(--text-primary)',
              }}
            >
              📝 Name
            </button>
          </div>

          {/* Mode Description */}
          <div className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'all' && 'Searches everywhere: titles, URLs, descriptions, tags, and AI-expanded terms'}
            {mode === 'semantic' && 'AI understands meaning - search "car" finds "ferrari", "bmw", "automotive", etc.'}
            {mode === 'tags' && 'Search only within your bookmark tags'}
            {mode === 'name' && 'Search in bookmark titles and URLs'}
          </div>
        </div>

        {/* Results */}
        <div>
          <div className="mb-4" style={{ color: 'var(--text-secondary)' }}>
            {loading ? (
              'Searching...'
            ) : query.trim() ? (
              results.length > 0 ? (
                `Found ${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`
              ) : (
                `No results found for "${query}"`
              )
            ) : (
              `All Bookmarks (${results.length})`
            )}
          </div>

            {/* Results Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {results.map((bookmark) => (
                <div
                  key={bookmark.id}
                  onClick={() => openBookmark(bookmark.url)}
                  className="rounded-xl shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
                  style={{ backgroundColor: 'var(--bg-primary)' }}
                >
                  <div className="flex items-start gap-3">
                    {/* Favicon with fallback */}
                    <div className="w-8 h-8 rounded flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', minWidth: '32px' }}>
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(bookmark.url)}&sz=32`}
                        className="w-8 h-8 rounded"
                        alt=""
                        style={{ display: 'block' }}
                        onError={(e) => {
                          const img = e.target as HTMLImageElement
                          img.style.display = 'none'
                          const parent = img.parentElement as HTMLElement
                          if (parent && parent.dataset.fallback !== 'true') {
                            parent.textContent = (bookmark.title || getDomain(bookmark.url)).charAt(0).toUpperCase()
                            parent.dataset.fallback = 'true'
                          }
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="font-semibold mb-1 truncate" style={{ color: 'var(--text-primary)' }}>
                        {bookmark.title || getDomain(bookmark.url)}
                      </h3>

                      {/* URL */}
                      <p className="text-sm mb-2 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {getDomain(bookmark.url)}
                      </p>

                      {/* Description */}
                      {bookmark.description && (
                        <p className="text-sm mb-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          {bookmark.description}
                        </p>
                      )}

                      {/* Tags */}
                      {getBookmarkTags(bookmark).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {getBookmarkTags(bookmark).map((tag) => (
                            <span
                              key={tag.id}
                              className="text-xs px-2 py-1 rounded-full"
                              style={{
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Collection badge */}
                      {bookmark.collections && (
                        <div className="mt-2">
                          <span
                            className="text-xs px-2 py-1 rounded"
                            style={{
                              backgroundColor: 'var(--bg-secondary)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            📁 {bookmark.collections.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state */}
            {!loading && results.length === 0 && (
              <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
                <p className="text-6xl mb-4">🔍</p>
                <p className="text-lg">{query.trim() ? 'No bookmarks found' : 'No bookmarks yet'}</p>
                <p className="text-sm mt-2">{query.trim() ? 'Try different search terms or switch search mode' : 'Add some bookmarks to see them here'}</p>
              </div>
            )}
        </div>
      </div>
    </DashboardLayout>
  )
}
