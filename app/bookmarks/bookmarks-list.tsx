'use client'

import { useState, useMemo, memo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import type { Bookmark, Tag } from '@/lib/types'

interface BookmarksListProps {
  initialBookmarks: Bookmark[]
  initialTags: Tag[]
  initialBookmarkTags: Record<string, Tag[]>
}

// Simple memoized bookmark card
const BookmarkCard = memo(({ bookmark, tags, onFavorite, onRead, onEdit, onDelete }: {
  bookmark: Bookmark
  tags: Tag[]
  onFavorite: () => void
  onRead: () => void
  onEdit: () => void
  onDelete: () => void
}) => {
  const getDomain = (url: string) => {
    try { return new URL(url).hostname }
    catch { return url }
  }

  return (
    <Card>
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
          <button onClick={onFavorite} className="p-2 rounded transition-all" style={{ cursor: 'pointer', color: bookmark.is_favorite ? '#eab308' : '#9ca3af' }}>
            <svg className="w-5 h-5" fill={bookmark.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
          </button>
          <button onClick={onRead} className="p-2 rounded transition-all" style={{ cursor: 'pointer', color: !bookmark.is_read ? '#2563eb' : '#9ca3af' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </button>
          <button onClick={onEdit} className="p-2 rounded transition-all" style={{ cursor: 'pointer', color: '#9ca3af' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={onDelete} className="p-2 rounded transition-all hover:text-red-600" style={{ cursor: 'pointer', color: '#9ca3af' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </CardContent>
    </Card>
  )
})

BookmarkCard.displayName = 'BookmarkCard'

export function BookmarksList({ initialBookmarks, initialTags, initialBookmarkTags }: BookmarksListProps) {
  const [bookmarks, setBookmarks] = useState(initialBookmarks)
  const [tags] = useState(initialTags)
  const [bookmarkTags] = useState(initialBookmarkTags)
  const [searchQuery, setSearchQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)
  const [formData, setFormData] = useState({ url: '', title: '', description: '', notes: '' })

  // Fetch data on mount if initial data is empty
  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [bookmarksRes, bookmarkTagsRes] = await Promise.all([
        supabase.from('bookmarks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('bookmark_tags').select('bookmark_id, tags(*)'),
      ])

      if (bookmarksRes.data) setBookmarks(bookmarksRes.data)

      const tagMap: Record<string, Tag[]> = {}
      bookmarkTagsRes.data?.forEach((bt: any) => {
        if (bt.tags) {
          if (!tagMap[bt.bookmark_id]) tagMap[bt.bookmark_id] = []
          tagMap[bt.bookmark_id].push(bt.tags)
        }
      })
      // @ts-ignore
      window.__bookmarkTags = tagMap
    }

    if (initialBookmarks.length === 0) {
      fetchData()
    }
  }, [initialBookmarks])

  // Memoized filtering - instant search
  const filteredBookmarks = useMemo(() => {
    if (!searchQuery) return bookmarks
    const q = searchQuery.toLowerCase()
    return bookmarks.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      (b.description?.toLowerCase().includes(q))
    )
  }, [bookmarks, searchQuery])

  const handleFavorite = async (bookmark: Bookmark) => {
    await supabase.from('bookmarks').update({ is_favorite: !bookmark.is_favorite }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_favorite: !b.is_favorite } : b))
  }

  const handleRead = async (bookmark: Bookmark) => {
    await supabase.from('bookmarks').update({ is_read: !bookmark.is_read }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_read: !b.is_read } : b))
  }

  const handleDelete = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
    setBookmarks(bookmarks.filter(b => b.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (editingBookmark) {
      await supabase.from('bookmarks').update({
        url: formData.url,
        title: formData.title || new URL(formData.url).hostname,
        description: formData.description || null,
      }).eq('id', editingBookmark.id)
    } else {
      await supabase.from('bookmarks').insert({
        url: formData.url,
        title: formData.title || new URL(formData.url).hostname,
        description: formData.description || null,
        user_id: user.id,
      })
    }
    window.location.reload()
  }

  return (
    <>
      {/* Search bar */}
      <div className="flex items-center gap-4 mb-6">
        <Input
          placeholder="Search bookmarks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-64"
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {filteredBookmarks.length} bookmark{filteredBookmarks.length !== 1 ? 's' : ''}
        </span>
      </div>

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
              onEdit={() => { setEditingBookmark(bookmark); setFormData({ url: bookmark.url, title: bookmark.title || '', description: bookmark.description || '', notes: bookmark.notes || '' }); setModalOpen(true) }}
              onDelete={() => handleDelete(bookmark.id)}
            />
          ))}
        </div>
      )}

      {/* Add button - hidden by default */}
      <button
        id="add-bookmark-btn"
        onClick={() => setModalOpen(true)}
        style={{ display: 'none' }}
      />

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingBookmark ? 'Edit Bookmark' : 'Add Bookmark'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="URL" placeholder="https://example.com" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })} required />
          <Input label="Title" placeholder="Bookmark title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          <Textarea label="Description" placeholder="Optional description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editingBookmark ? 'Update' : 'Add'} Bookmark</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
