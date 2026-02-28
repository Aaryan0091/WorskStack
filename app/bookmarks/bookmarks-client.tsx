'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import type { Bookmark, Tag } from '@/lib/types'

interface Props {
  bookmarks: Bookmark[]
  tags: Tag[]
  bookmarkTags: Record<string, Tag[]>
}

export function BookmarksClient({ bookmarks: initialBookmarks, tags, bookmarkTags }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [bookmarks, setBookmarks] = useState(initialBookmarks)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [formData, setFormData] = useState({
    url: '',
    title: '',
    description: '',
    notes: '',
    folder_id: '',
    tag_ids: [] as string[],
  })
  const [tagInput, setTagInput] = useState('')
  const [formError, setFormError] = useState('')
  const processedUrlParams = useRef(false)
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; tagId: string } | null>(null)
  const [tagAdded, setTagAdded] = useState(false)

  // Handle URL parameters from extension popup
  useEffect(() => {
    const addUrl = searchParams.get('addUrl')
    const addTitle = searchParams.get('addTitle')

    if (addUrl && !processedUrlParams.current) {
      processedUrlParams.current = true
      // Pre-fill form and open modal
      // Delay setState to avoid triggering during render
      setTimeout(() => {
        setFormData({
          url: decodeURIComponent(addUrl),
          title: addTitle ? decodeURIComponent(addTitle) : '',
          description: '',
          notes: '',
          folder_id: '',
          tag_ids: [],
        })
        setModalOpen(true)
      }, 0)

      // Clear URL params
      window.history.replaceState({}, '', '/bookmarks')
    }
  }, [searchParams])

  const filteredBookmarks = bookmarks.filter(b => {
    const matchesSearch =
      !searchQuery ||
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.url.toLowerCase().includes(searchQuery.toLowerCase())

    const favoriteFilter = searchParams.get('favorite')
    const matchesFavorite = favoriteFilter !== 'true' || b.is_favorite

    return matchesSearch && matchesFavorite
  })

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`/bookmarks?${params.toString()}`))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const bookmarkData = {
      url: formData.url,
      title: formData.title || new URL(formData.url).hostname,
      description: formData.description || null,
      notes: formData.notes || null,
      folder_id: formData.folder_id || null,
    }

    if (editingBookmark) {
      const { data } = await supabase.from('bookmarks').update(bookmarkData).eq('id', editingBookmark.id).select()
      if (data) {
        setBookmarks(bookmarks.map(b => b.id === editingBookmark.id ? { ...b, ...data[0] } : b))
      }
      await supabase.from('bookmark_tags').delete().eq('bookmark_id', editingBookmark.id)
      for (const tagId of formData.tag_ids) {
        await supabase.from('bookmark_tags').insert({ bookmark_id: editingBookmark.id, tag_id: tagId })
      }
      closeModal()
    } else {
      // Check if URL already exists
      const { data: existingBookmark } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('user_id', user.id)
        .eq('url', formData.url)
        .single()

      if (existingBookmark) {
        setFormError('This URL is already bookmarked')
        return
      }

      const { data } = await supabase.from('bookmarks').insert({ ...bookmarkData, user_id: user.id }).select()
      if (data && data[0]) {
        setBookmarks([data[0], ...bookmarks])
        // Add tags to bookmark
        for (const tagId of formData.tag_ids) {
          await supabase.from('bookmark_tags').insert({ bookmark_id: data[0].id, tag_id: tagId })
        }
      }
      closeModal()
    }
  }

  const toggleFavorite = async (bookmark: Bookmark) => {
    await supabase.from('bookmarks').update({ is_favorite: !bookmark.is_favorite }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_favorite: !b.is_favorite } : b))
  }

  const toggleRead = async (bookmark: Bookmark) => {
    await supabase.from('bookmarks').update({ is_read: !bookmark.is_read }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_read: !b.is_read } : b))
  }

  const deleteBookmark = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
    setBookmarks(bookmarks.filter(b => b.id !== id))
  }

  const openModal = async (bookmark?: Bookmark) => {
    if (bookmark) {
      setEditingBookmark(bookmark)
      const { data } = await supabase.from('bookmark_tags').select('tag_id').eq('bookmark_id', bookmark.id)
      const tagIds = data?.map((bt: { tag_id: string }) => bt.tag_id) || []
      setFormData({
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description || '',
        notes: bookmark.notes || '',
        folder_id: bookmark.folder_id || '',
        tag_ids: tagIds,
      })
    } else {
      setEditingBookmark(null)
      setFormData({ url: '', title: '', description: '', notes: '', folder_id: '', tag_ids: [] })
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingBookmark(null)
    setFormError('')
  }

  const addTag = async () => {
    if (!tagInput.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase.from('tags').insert({ name: tagInput.trim(), user_id: user.id }).select()
    if (data) {
      tags.push(data[0])
      setFormData({ ...formData, tag_ids: [...formData.tag_ids, data[0].id] })
      setTagInput('')
      setTagAdded(true)
      setTimeout(() => setTagAdded(false), 300)
    }
  }

  const deleteTag = async (tagId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('tags').delete().eq('id', tagId).eq('user_id', user.id)
    const index = tags.findIndex(t => t.id === tagId)
    if (index > -1) {
      tags.splice(index, 1)
    }
    setFormData({ ...formData, tag_ids: formData.tag_ids.filter(id => id !== tagId) })
    setTagContextMenu(null)
  }

  const handleTagRightClick = (e: React.MouseEvent, tagId: string) => {
    e.preventDefault()
    setTagContextMenu({ x: e.clientX, y: e.clientY, tagId })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Bookmarks</h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Save and organize your links</p>
          </div>
          <Button onClick={() => openModal()}>+ Add Bookmark</Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap items-center">
          <Input
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
          <button
            onClick={() => {
              const current = searchParams.get('favorite')
              updateFilter('favorite', current === 'true' ? '' : 'true')
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-75 active:scale-90 ${searchParams.get('favorite') === 'true' ? 'bg-yellow-100 text-yellow-800' : ''}`}
            style={{ cursor: 'pointer', backgroundColor: searchParams.get('favorite') === 'true' ? undefined : 'var(--bg-secondary)', color: searchParams.get('favorite') === 'true' ? undefined : 'var(--text-primary)' }}
          >
            {searchParams.get('favorite') === 'true' ? '⭐ Favorites' : 'Favorites'}
          </button>
        </div>

        {/* Bookmarks Grid */}
        {filteredBookmarks.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
              No bookmarks found. Add your first bookmark!
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBookmarks.map(bookmark => (
              <Card key={bookmark.id} className={`${bookmark.is_read ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`}
                      className="w-8 h-8 rounded"
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="flex-1 min-w-0">
                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:text-blue-600 truncate block"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => !bookmark.is_read && toggleRead(bookmark)}
                      >
                        {bookmark.title}
                      </a>
                      <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
                      {bookmark.description && (
                        <p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{bookmark.description}</p>
                      )}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {bookmarkTags[bookmark.id]?.map(tag => (
                          <span key={tag.id} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: tag.color + '20', color: tag.color }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                    <button
                      onClick={() => toggleFavorite(bookmark)}
                      className={`p-2 rounded transition-all duration-75 active:scale-90 ${bookmark.is_favorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                      style={{ cursor: 'pointer' }}
                    >
                      <svg className="w-5 h-5" fill={bookmark.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => toggleRead(bookmark)}
                      className={`p-2 rounded transition-all duration-75 active:scale-90 ${bookmark.is_read ? 'text-green-500' : 'text-gray-400 hover:text-green-500'}`}
                      title={bookmark.is_read ? 'Mark unread' : 'Mark read'}
                      style={{ cursor: 'pointer' }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={bookmark.is_read ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'} />
                      </svg>
                    </button>
                    <button
                      onClick={() => openModal(bookmark)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded transition-all duration-75 active:scale-90"
                      style={{ cursor: 'pointer' }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteBookmark(bookmark.id)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded transition-all duration-75 active:scale-90"
                      style={{ cursor: 'pointer' }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={editingBookmark ? 'Edit Bookmark' : 'Add Bookmark'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="URL"
            placeholder="https://example.com"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            required
          />
          <Input
            label="Title"
            placeholder="Bookmark title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="Brief description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
          <Textarea
            label="Notes"
            placeholder="Your notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Tags</label>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="New tag name"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={addTag}
                variant="secondary"
                className="!active:scale-100 !focus:ring-0 !focus:ring-offset-0"
                style={{
                  backgroundColor: tagAdded ? 'rgba(34, 197, 94, 0.3)' : undefined,
                  transition: 'background-color 0.2s ease'
                }}
              >
                Add
              </Button>
            </div>
            <div
              className="flex flex-wrap gap-2 overflow-y-auto pr-1 tags-scroll-container"
              style={{
                maxHeight: '5.5rem',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent'
              }}
            >
              {tags
                .filter(tag => tag.name.toLowerCase().includes(tagInput.toLowerCase()))
                .sort((a, b) => {
                  const aSelected = formData.tag_ids.includes(a.id)
                  const bSelected = formData.tag_ids.includes(b.id)
                  if (aSelected && !bSelected) return -1
                  if (!aSelected && bSelected) return 1
                  return 0
                })
                .map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      if (formData.tag_ids.includes(tag.id)) {
                        setFormData({ ...formData, tag_ids: formData.tag_ids.filter(id => id !== tag.id) })
                      } else {
                        setFormData({ ...formData, tag_ids: [...formData.tag_ids, tag.id] })
                      }
                    }}
                    onContextMenu={(e) => handleTagRightClick(e, tag.id)}
                    className={`px-3 py-1 rounded-full text-sm transition-all duration-75 active:scale-90 ${formData.tag_ids.includes(tag.id) ? 'ring-2 ring-offset-2' : ''}`}
                    style={{ backgroundColor: tag.color + '20', color: tag.color, cursor: 'pointer' }}
                  >
                    {tag.name}
                  </button>
                ))}
            </div>
          </div>
          {formError && (
            <p className="text-red-500 text-sm">{formError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1">{editingBookmark ? 'Update' : 'Add'} Bookmark</Button>
          </div>
        </form>
      </Modal>

      {/* Tag Context Menu */}
      {tagContextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setTagContextMenu(null)}
          />
          <div
            className="fixed z-50 p-2 rounded-lg shadow-lg"
            style={{
              left: `${tagContextMenu.x}px`,
              top: `${tagContextMenu.y}px`,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              minWidth: '120px'
            }}
          >
            <button
              type="button"
              onClick={() => deleteTag(tagContextMenu.tagId)}
              className="w-full px-3 py-2 text-left text-sm rounded transition-colors"
              style={{ color: 'var(--text-primary)', cursor: 'pointer' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fecaca'
                e.currentTarget.style.color = '#dc2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
            >
              Delete Tag
            </button>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
