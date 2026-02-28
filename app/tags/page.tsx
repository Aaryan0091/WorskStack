'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { DashboardLayout } from '@/components/dashboard-layout'
import { UndoToast } from '@/components/ui/toast'
import type { Tag, Bookmark } from '@/lib/types'

export default function TagsPage() {
  const router = useRouter()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'count' | 'created'>('count')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)
  const [mergeSourceTag, setMergeSourceTag] = useState<Tag | null>(null)
  const [mergeTargetTag, setMergeTargetTag] = useState<string>('')

  // Form state
  const [editFormData, setEditFormData] = useState({ name: '', color: '' })

  // Bookmark counts per tag
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({})

  // Bulk selection state
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkMergeModalOpen, setBulkMergeModalOpen] = useState(false)
  const [bulkMergeTargetId, setBulkMergeTargetId] = useState('')
  const [selectMode, setSelectMode] = useState(false)  // New: select mode toggle

  // Undo toast state
  const [showUndoToast, setShowUndoToast] = useState(false)
  const [deletedTag, setDeletedTag] = useState<Tag | null>(null)

  // Keyboard navigation state
  const [focusedTagIndex, setFocusedTagIndex] = useState<number>(-1)

  // Create tag modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createFormData, setCreateFormData] = useState({ name: '', color: '#8b5cf6' })
  const [availableBookmarks, setAvailableBookmarks] = useState<Bookmark[]>([])
  const [bookmarksLoading, setBookmarksLoading] = useState(false)
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set())
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState('')

  // Group elements by their row (using vertical position with tolerance)
  const groupElementsByRow = () => {
    if (typeof window === 'undefined') return []

    const container = document.querySelector('[data-tags-container]')
    if (!container) return []

    const tagElements = Array.from(container.querySelectorAll('[data-tag-index]'))
    if (tagElements.length === 0) return []

    // Sort elements by their vertical position
    const elementsWithPositions = tagElements.map(el => {
      const rect = el.getBoundingClientRect()
      const index = parseInt(el.getAttribute('data-tag-index') || '-1')
      return { el, index, top: rect.top, centerX: rect.left + rect.width / 2 }
    }).sort((a, b) => a.top - b.top)

    // Group into rows (elements with similar top positions are in same row)
    const rows: Array<{ el: Element; index: number; top: number; centerX: number }[]> = []
    const rowTolerance = 10 // pixels tolerance for same row

    for (const item of elementsWithPositions) {
      if (rows.length === 0) {
        rows.push([item])
      } else {
        const lastRow = rows[rows.length - 1]
        const lastRowTop = lastRow[0].top
        if (Math.abs(item.top - lastRowTop) <= rowTolerance) {
          lastRow.push(item)
        } else {
          rows.push([item])
        }
      }
    }

    return rows
  }

  // Get the actual tag elements and find the one visually below
  const getTagBelow = (currentIndex: number): number => {
    const rows = groupElementsByRow()
    if (rows.length === 0) return currentIndex

    // Find current element's row and column
    let currentRowIndex = -1
    let currentColIndex = -1

    for (let r = 0; r < rows.length; r++) {
      const colIndex = rows[r].findIndex(item => item.index === currentIndex)
      if (colIndex !== -1) {
        currentRowIndex = r
        currentColIndex = colIndex
        break
      }
    }

    if (currentRowIndex === -1) return currentIndex

    // Move to next row
    const nextRowIndex = currentRowIndex + 1
    if (nextRowIndex >= rows.length) return currentIndex

    const nextRow = rows[nextRowIndex]

    // Find the element in the next row with closest horizontal center
    const currentCenterX = rows[currentRowIndex][currentColIndex].centerX
    let bestMatch = nextRow[0]
    let smallestDistance = Math.abs(nextRow[0].centerX - currentCenterX)

    for (let i = 1; i < nextRow.length; i++) {
      const distance = Math.abs(nextRow[i].centerX - currentCenterX)
      if (distance < smallestDistance) {
        smallestDistance = distance
        bestMatch = nextRow[i]
      }
    }

    return bestMatch.index
  }

  // Get the actual tag elements and find the one visually above
  const getTagAbove = (currentIndex: number): number => {
    const rows = groupElementsByRow()
    if (rows.length === 0) return currentIndex

    // Find current element's row and column
    let currentRowIndex = -1
    let currentColIndex = -1

    for (let r = 0; r < rows.length; r++) {
      const colIndex = rows[r].findIndex(item => item.index === currentIndex)
      if (colIndex !== -1) {
        currentRowIndex = r
        currentColIndex = colIndex
        break
      }
    }

    if (currentRowIndex === -1 || currentRowIndex === 0) return currentIndex

    // Move to previous row
    const prevRowIndex = currentRowIndex - 1
    const prevRow = rows[prevRowIndex]

    // Find the element in the previous row with closest horizontal center
    const currentCenterX = rows[currentRowIndex][currentColIndex].centerX
    let bestMatch = prevRow[0]
    let smallestDistance = Math.abs(prevRow[0].centerX - currentCenterX)

    for (let i = 1; i < prevRow.length; i++) {
      const distance = Math.abs(prevRow[i].centerX - currentCenterX)
      if (distance < smallestDistance) {
        smallestDistance = distance
        bestMatch = prevRow[i]
      }
    }

    return bestMatch.index
  }

  // Declare fetchTags before useEffect
  const fetchTags = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch tags with bookmark counts
    const { data: tagsData } = await supabase
      .from('tags')
      .select('*, bookmark_tags(count)')
      .eq('user_id', user.id)
      .order('name', { ascending: true })

    if (tagsData) {
      setTags(tagsData)

      // Extract counts from the aggregated data
      const counts: Record<string, number> = {}
      for (const tag of tagsData) {
        const bookmarkTags = (tag as { bookmark_tags?: Array<{ count: number }> }).bookmark_tags
        counts[tag.id] = bookmarkTags?.[0]?.count || 0
      }
      setTagCounts(counts)
    }

    setLoading(false)
  }

  // Call fetchTags on mount
  useEffect(() => {
    fetchTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sort and filter tags
  const sortedTags = [...tags].sort((a, b) => {
    if (sortBy === 'name') {
      return sortOrder === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    } else if (sortBy === 'created') {
      return sortOrder === 'asc'
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    } else {
      const aCount = tagCounts[a.id] || 0
      const bCount = tagCounts[b.id] || 0
      return sortOrder === 'asc' ? aCount - bCount : bCount - aCount
    }
  })

  const filteredTags = sortedTags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Reset focused index when filtered tags change
  useEffect(() => {
    setFocusedTagIndex(-1)
  }, [searchQuery, sortBy, sortOrder])

  // Keyboard navigation handler with visual 2D grid support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return
      }

      // Ignore if modals are open
      if (editModalOpen || deleteModalOpen || mergeModalOpen || bulkDeleteModalOpen || bulkMergeModalOpen || createModalOpen) {
        return
      }

      const visibleTags = filteredTags
      if (visibleTags.length === 0) return

      const currentIndex = focusedTagIndex

      const getNewIndex = (key: string): number => {
        if (currentIndex === -1) return 0

        switch (key) {
          case 'ArrowRight':
            if (currentIndex < visibleTags.length - 1) {
              return currentIndex + 1
            }
            return currentIndex

          case 'ArrowLeft':
            if (currentIndex > 0) {
              return currentIndex - 1
            }
            return currentIndex

          case 'ArrowDown':
            // Use actual DOM positions to find the tag below
            return getTagBelow(currentIndex)

          case 'ArrowUp':
            // Use actual DOM positions to find the tag above
            return getTagAbove(currentIndex)

          default:
            return currentIndex
        }
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault()
          setFocusedTagIndex(getNewIndex(e.key))
          break

        case 'Enter':
        case ' ':
          e.preventDefault()
          if (selectMode && focusedTagIndex >= 0 && focusedTagIndex < visibleTags.length) {
            toggleTagSelection(visibleTags[focusedTagIndex].id)
          }
          break

        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            setSelectMode(!selectMode)
            if (!selectMode) {
              setSelectedTagIds(new Set())
            }
          }
          break

        case 'Escape':
          e.preventDefault()
          setSelectedTagIds(new Set())
          setSelectMode(false)
          setFocusedTagIndex(-1)
          break

        case 'Delete':
        case 'Backspace':
          if (selectedTagIds.size > 0) {
            e.preventDefault()
            setBulkDeleteModalOpen(true)
          } else if (focusedTagIndex >= 0 && focusedTagIndex < visibleTags.length) {
            e.preventDefault()
            setSelectedTagIds(new Set([visibleTags[focusedTagIndex].id]))
            setBulkDeleteModalOpen(true)
          }
          break

        case 'e':
        case 'E':
          if (focusedTagIndex >= 0 && focusedTagIndex < visibleTags.length) {
            e.preventDefault()
            openEditModal(visibleTags[focusedTagIndex])
          }
          break

        case 'm':
        case 'M':
          if (focusedTagIndex >= 0 && focusedTagIndex < visibleTags.length) {
            e.preventDefault()
            openMergeModal(visibleTags[focusedTagIndex])
          }
          break

        case 'a':
        case 'A':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            selectAllTags()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTags, focusedTagIndex, selectedTagIds, editModalOpen, deleteModalOpen, mergeModalOpen, bulkDeleteModalOpen, bulkMergeModalOpen, createModalOpen, searchQuery, sortBy, sortOrder, selectMode])

  const openEditModal = (tag: Tag) => {
    setSelectedTag(tag)
    setEditFormData({ name: tag.name, color: tag.color || '' })
    setEditModalOpen(true)
  }

  const openDeleteModal = (tag: Tag) => {
    setSelectedTag(tag)
    setDeleteModalOpen(true)
  }

  const openMergeModal = (tag: Tag) => {
    setMergeSourceTag(tag)
    setMergeTargetTag('')
    setMergeModalOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!selectedTag) return

    const { error } = await supabase
      .from('tags')
      .update({ name: editFormData.name, color: editFormData.color })
      .eq('id', selectedTag.id)

    if (error) {
      console.error('Failed to update tag:', error)
      return
    }

    await fetchTags()
    setEditModalOpen(false)
    setSelectedTag(null)
  }

  const handleDelete = async () => {
    if (!selectedTag) return

    // Store the deleted tag for potential undo
    const tagToDelete = selectedTag

    // Remove from UI only (soft delete)
    setTags(tags.filter(t => t.id !== tagToDelete.id))
    setDeleteModalOpen(false)
    setSelectedTag(null)

    // Show undo toast
    setDeletedTag(tagToDelete)
    setShowUndoToast(true)
  }

  const undoDeleteTag = async () => {
    if (!deletedTag) return

    // Restore the tag to the database
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: restoredTag } = await supabase
      .from('tags')
      .insert({
        name: deletedTag.name,
        color: deletedTag.color,
        user_id: user.id,
      })
      .select()
      .single()

    if (restoredTag) {
      setTags([restoredTag, ...tags])
    }

    setDeletedTag(null)
  }

  const permanentDeleteTag = async (tag: Tag) => {
    // Delete from bookmark_tags junction table first
    await supabase
      .from('bookmark_tags')
      .delete()
      .eq('tag_id', tag.id)

    // Delete the tag
    await supabase
      .from('tags')
      .delete()
      .eq('id', tag.id)
  }

  const handleMerge = async () => {
    if (!mergeSourceTag || !mergeTargetTag || mergeSourceTag.id === mergeTargetTag) return

    // Update all bookmark_tags to point to the target tag
    const { data: existingRelations } = await supabase
      .from('bookmark_tags')
      .select('id, bookmark_id')
      .eq('tag_id', mergeSourceTag.id)

    if (existingRelations) {
      for (const rel of existingRelations) {
        // Check if target already has this bookmark
        const { data: existing } = await supabase
          .from('bookmark_tags')
          .select('id')
          .eq('tag_id', mergeTargetTag)
          .eq('bookmark_id', rel.bookmark_id)
          .single()

        if (!existing) {
          await supabase
            .from('bookmark_tags')
            .insert({ tag_id: mergeTargetTag, bookmark_id: rel.bookmark_id })
        }

        // Delete old relation
        await supabase
          .from('bookmark_tags')
          .delete()
          .eq('id', rel.id)
      }
    }

    // Delete the source tag
    await supabase
      .from('tags')
      .delete()
      .eq('id', mergeSourceTag.id)

    await fetchTags()
    setMergeModalOpen(false)
    setMergeSourceTag(null)
  }

  const toggleTagSelection = (tagId: string) => {
    const newSelection = new Set(selectedTagIds)
    if (newSelection.has(tagId)) {
      newSelection.delete(tagId)
    } else {
      newSelection.add(tagId)
    }
    setSelectedTagIds(newSelection)
  }

  const selectAllTags = () => {
    if (selectedTagIds.size === filteredTags.length) {
      setSelectedTagIds(new Set())
    } else {
      setSelectedTagIds(new Set(filteredTags.map(t => t.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedTagIds.size === 0) return

    // Delete all selected tags
    for (const tagId of selectedTagIds) {
      await supabase.from('bookmark_tags').delete().eq('tag_id', tagId)
      await supabase.from('tags').delete().eq('id', tagId)
    }

    await fetchTags()
    setSelectedTagIds(new Set())
    setBulkDeleteModalOpen(false)
  }

  const handleBulkMerge = async () => {
    if (selectedTagIds.size < 2 || !bulkMergeTargetId) return

    const targetId = bulkMergeTargetId
    const sourceIds = Array.from(selectedTagIds).filter(id => id !== targetId)

    // For each source tag, move all bookmark relations to target
    for (const sourceId of sourceIds) {
      const { data: existingRelations } = await supabase
        .from('bookmark_tags')
        .select('bookmark_id')
        .eq('tag_id', sourceId)

      if (existingRelations) {
        for (const rel of existingRelations) {
          // Check if target already has this bookmark
          const { data: existing } = await supabase
            .from('bookmark_tags')
            .select('id')
            .eq('tag_id', targetId)
            .eq('bookmark_id', rel.bookmark_id)
            .single()

          if (!existing) {
            await supabase
              .from('bookmark_tags')
              .insert({ tag_id: targetId, bookmark_id: rel.bookmark_id })
          }
        }
      }

      // Delete source tag
      await supabase.from('bookmark_tags').delete().eq('tag_id', sourceId)
      await supabase.from('tags').delete().eq('id', sourceId)
    }

    await fetchTags()
    setSelectedTagIds(new Set())
    setBulkMergeModalOpen(false)
    setBulkMergeTargetId('')
  }

  // Fetch bookmarks for the create tag modal
  const fetchBookmarks = async () => {
    setBookmarksLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: bookmarksData } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('title', { ascending: true })

    if (bookmarksData) {
      setAvailableBookmarks(bookmarksData)
    }
    setBookmarksLoading(false)
  }

  // Open create tag modal
  const openCreateModal = async () => {
    await fetchBookmarks()
    setCreateFormData({ name: '', color: '#8b5cf6' })
    setSelectedBookmarkIds(new Set())
    setBookmarkSearchQuery('')
    setCreateModalOpen(true)
  }

  // Handle creating a new tag
  const handleCreateTag = async () => {
    if (!createFormData.name.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Create the tag
    const { data: newTag, error } = await supabase
      .from('tags')
      .insert({
        name: createFormData.name.trim(),
        color: createFormData.color,
        user_id: user.id,
      })
      .select()
      .single()

    if (error || !newTag) {
      console.error('Failed to create tag:', error)
      return
    }

    // Assign tag to selected bookmarks
    if (selectedBookmarkIds.size > 0) {
      const bookmarkTagEntries = Array.from(selectedBookmarkIds).map(bookmarkId => ({
        tag_id: newTag.id,
        bookmark_id: bookmarkId,
      }))

      await supabase.from('bookmark_tags').insert(bookmarkTagEntries)
    }

    await fetchTags()
    setCreateModalOpen(false)
    setCreateFormData({ name: '', color: '#8b5cf6' })
    setSelectedBookmarkIds(new Set())
    setBookmarkSearchQuery('')
  }

  // Toggle bookmark selection in create modal
  const toggleBookmarkSelection = (bookmarkId: string) => {
    const newSelection = new Set(selectedBookmarkIds)
    if (newSelection.has(bookmarkId)) {
      newSelection.delete(bookmarkId)
    } else {
      newSelection.add(bookmarkId)
    }
    setSelectedBookmarkIds(newSelection)
  }

  const getTagColors = () => [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e'
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Tags</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {tags.length} {tags.length === 1 ? 'tag' : 'tags'} to organize your bookmarks
          </p>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx={11} cy={11} r={8} strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
          </svg>
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [newSortBy, newSortOrder] = e.target.value.split('-') as ['name' | 'count', 'asc' | 'desc']
            setSortBy(newSortBy)
            setSortOrder(newSortOrder)
          }}
          className="px-4 py-2 pr-10 rounded-lg text-sm cursor-pointer appearance-none focus:outline-none focus:ring-0"
          aria-label="Sort tags"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.75rem center',
            backgroundSize: '1rem'
          }}
        >
          <option value="count-desc">Most Used</option>
          <option value="count-asc">Least Used</option>
          <option value="created-desc">Recent</option>
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
        </select>

        {/* Create New Tag Button */}
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border cursor-pointer bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">New Tag</span>
        </button>

        {/* Select Mode Toggle Button */}
        <button
          onClick={() => {
            const newMode = !selectMode
            setSelectMode(newMode)
            if (!newMode) {
              setSelectedTagIds(new Set())
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border cursor-pointer ${selectMode ? 'ring-2 bg-blue-600 text-white border-blue-600' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)]'}`}
          aria-label={selectMode ? 'Exit select mode' : 'Enter select mode'}
          aria-pressed={selectMode}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {selectMode ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          <span className="hidden sm:inline">{selectMode ? 'Selecting...' : 'Select'}</span>
        </button>

        {/* Keyboard shortcuts hint */}
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }} aria-label="Keyboard shortcuts">
          <span className="hidden md:inline">
            {selectMode ? (
              <>
                <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>↑↓←→</kbd> navigate ·
                <kbd className="px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>Enter/Space</kbd> select ·
                <kbd className="px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>S</kbd> exit ·
                <kbd className="px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>Esc</kbd> clear
              </>
            ) : (
              <>
                Shortcuts: <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>↑↓←→</kbd> navigate ·
                <kbd className="px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>E</kbd> edit ·
                <kbd className="px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>S</kbd> select mode
              </>
            )}
          </span>
        </div>
      </div>

      {/* Bulk Action Bar - Shows when tags are selected */}
      {selectedTagIds.size > 0 && (
        <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              checked={selectedTagIds.size === filteredTags.length}
              onChange={selectAllTags}
              className="w-5 h-5 rounded cursor-pointer"
            />
            <span style={{ color: 'var(--text-primary)' }}>
              <strong>{selectedTagIds.size}</strong> tag{selectedTagIds.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setBulkMergeModalOpen(true)}
              disabled={selectedTagIds.size < 2}
              variant="secondary"
              className="disabled:opacity-50"
            >
              Merge Selected
            </Button>
            <Button
              size="sm"
              onClick={() => setBulkDeleteModalOpen(true)}
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-12 w-24 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />
            </div>
          ))}
        </div>
      ) : tags.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <span className="text-4xl">🏷️</span>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>No tags yet</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Add tags to your bookmarks to see them here!
                </p>
              </div>
              <Button onClick={() => router.push('/bookmarks')}>
                Go to Bookmarks
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : filteredTags.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            No tags found matching &quot;{searchQuery}&quot;
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3" data-tags-container>
          {filteredTags.map((tag, index) => (
            <div
              key={tag.id}
              data-tag-index={index}
              className={`group relative rounded-xl px-4 py-3 transition-all duration-200 ${selectMode ? 'hover:scale-105' : ''} hover:shadow-lg ${selectedTagIds.has(tag.id) ? 'ring-2 ring-purple-500' : ''} ${focusedTagIndex === index ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
              style={{
                backgroundColor: `${tag.color || '#8b5cf6'}15`,
                border: `1px solid ${tag.color || '#8b5cf6'}40`,
                outline: focusedTagIndex === index ? '2px solid #3b82f6' : 'none',
                cursor: selectMode ? 'pointer' : 'default'
              }}
              tabIndex={0}
              onFocus={() => setFocusedTagIndex(index)}
              onClick={() => {
                setFocusedTagIndex(index)
                if (selectMode) {
                  toggleTagSelection(tag.id)
                }
              }}
              onKeyDown={(e) => {
                if (selectMode && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  toggleTagSelection(tag.id)
                }
              }}
              aria-label={`Tag: ${tag.name}, ${tagCounts[tag.id] || 0} bookmarks${focusedTagIndex === index ? ', focused' : ''}${selectedTagIds.has(tag.id) ? ', selected' : ''}`}
            >
              {/* Tag Content */}
              <div className="flex items-center gap-2">
                {/* Selection Checkbox - only show in select mode */}
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedTagIds.has(tag.id)}
                    onChange={() => toggleTagSelection(tag.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded cursor-pointer"
                    aria-label={`Select ${tag.name}`}
                  />
                )}
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color || '#8b5cf6' }}
                />
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {tag.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{
                  backgroundColor: `${tag.color || '#8b5cf6'}30`,
                  color: tag.color || '#8b5cf6'
                }}>
                  {tagCounts[tag.id] || 0}
                </span>
              </div>

              {/* Action Buttons - Show on Hover */}
              <div className="absolute -top-2 -right-2 hidden group-hover:flex items-center gap-1 rounded-lg shadow-lg p-0.5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => openEditModal(tag)}
                  className="group/btn relative p-1.5 rounded transition-all hover:scale-110"
                  style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#3b82f6' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span
                    className="absolute left-1/2 top-full mt-2 -translate-x-1/2 px-2 py-1 text-xs text-white rounded whitespace-nowrap opacity-0 transition-opacity duration-0 group-hover/btn:opacity-100 group-hover/btn:delay-300 pointer-events-none z-50"
                    style={{
                      backgroundColor: '#1f2937'
                    }}
                  >
                    Edit
                  </span>
                </button>
                <button
                  onClick={() => openMergeModal(tag)}
                  className="group/btn relative p-1.5 rounded transition-all hover:scale-110"
                  style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#10b981' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
                  </svg>
                  <span
                    className="absolute left-1/2 top-full mt-2 -translate-x-1/2 px-2 py-1 text-xs text-white rounded whitespace-nowrap opacity-0 transition-opacity duration-0 group-hover/btn:opacity-100 group-hover/btn:delay-300 pointer-events-none z-50"
                    style={{
                      backgroundColor: '#1f2937'
                    }}
                  >
                    Merge
                  </span>
                </button>
                <button
                  onClick={() => openDeleteModal(tag)}
                  className="group/btn relative p-1.5 rounded transition-all hover:scale-110"
                  style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span
                    className="absolute left-1/2 top-full mt-2 -translate-x-1/2 px-2 py-1 text-xs text-white rounded whitespace-nowrap opacity-0 transition-opacity duration-0 group-hover/btn:opacity-100 group-hover/btn:delay-300 pointer-events-none z-50"
                    style={{
                      backgroundColor: '#1f2937'
                    }}
                  >
                    Delete
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Tag">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Tag Name</label>
            <Input
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              placeholder="Enter tag name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Color</label>
            <div className="flex flex-wrap gap-2">
              {getTagColors().map(color => (
                <button
                  key={color}
                  onClick={() => setEditFormData({ ...editFormData, color })}
                  className={`w-10 h-10 rounded-full transition-transform hover:scale-110 ${editFormData.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setEditModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              className="flex-1"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white' }}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Tag">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
            <span className="text-2xl">⚠️</span>
            <div>
              <p style={{ color: 'var(--text-primary)' }}>
                Are you sure you want to delete <strong>&quot;{selectedTag?.name}&quot;</strong>?
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                This will remove the tag from all bookmarks but won&apos;t delete the bookmarks themselves.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setDeleteModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              className="flex-1"
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              Delete Tag
            </Button>
          </div>
        </div>
      </Modal>

      {/* Merge Modal */}
      <Modal isOpen={mergeModalOpen} onClose={() => setMergeModalOpen(false)} title="Merge Tag">
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }}>
            Merge <strong>&quot;{mergeSourceTag?.name}&quot;</strong> into another tag.
            All bookmarks tagged with &quot;{mergeSourceTag?.name}&quot; will also have the target tag.
          </p>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Select Target Tag</label>
            <select
              value={mergeTargetTag}
              onChange={(e) => setMergeTargetTag(e.target.value)}
              className="w-full px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              <option value="">Select a tag...</option>
              {tags
                .filter(t => t.id !== mergeSourceTag?.id)
                .map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setMergeModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={!mergeTargetTag || mergeTargetTag === mergeSourceTag?.id}
              className="flex-1"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white' }}
            >
              Merge Tags
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Modal */}
      <Modal isOpen={bulkDeleteModalOpen} onClose={() => setBulkDeleteModalOpen(false)} title="Delete Multiple Tags">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
            <span className="text-2xl">⚠️</span>
            <div>
              <p style={{ color: 'var(--text-primary)' }}>
                Are you sure you want to delete <strong>{selectedTagIds.size} tags</strong>?
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                This will remove all selected tags from their bookmarks but won&apos;t delete the bookmarks themselves.
              </p>
            </div>
          </div>

          {/* List of tags to be deleted */}
          <div className="max-h-40 overflow-y-auto p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {tags.filter(t => selectedTagIds.has(t.id)).map(tag => (
              <div key={tag.id} className="flex items-center gap-2 py-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: tag.color || '#8b5cf6' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{tag.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  ({tagCounts[tag.id] || 0} bookmarks)
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setBulkDeleteModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkDelete}
              className="flex-1"
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              Delete {selectedTagIds.size} Tags
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Merge Modal */}
      <Modal isOpen={bulkMergeModalOpen} onClose={() => setBulkMergeModalOpen(false)} title="Merge Multiple Tags">
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }}>
            Merge <strong>{selectedTagIds.size} tags</strong> into a single target tag.
            All bookmarks from the other tags will also have the target tag.
          </p>

          {/* List of tags to be merged */}
          <div className="max-h-32 overflow-y-auto p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {tags.filter(t => selectedTagIds.has(t.id)).map(tag => (
              <div key={tag.id} className="flex items-center gap-2 py-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: tag.color || '#8b5cf6' }}
                />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{tag.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  ({tagCounts[tag.id] || 0} bookmarks)
                </span>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Select Target Tag (this tag will be kept)
            </label>
            <select
              value={bulkMergeTargetId}
              onChange={(e) => setBulkMergeTargetId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              <option value="">Select a tag...</option>
              {tags
                .filter(t => selectedTagIds.has(t.id))
                .map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setBulkMergeModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkMerge}
              disabled={!bulkMergeTargetId}
              className="flex-1"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white' }}
            >
              Merge Tags
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create New Tag Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create New Tag" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Tag Name</label>
            <Input
              value={createFormData.name}
              onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
              placeholder="Enter tag name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Color</label>
            <div className="flex flex-wrap gap-2">
              {getTagColors().map(color => (
                <button
                  key={color}
                  onClick={() => setCreateFormData({ ...createFormData, color })}
                  className={createFormData.color === color ? 'w-10 h-10 rounded-full transition-transform hover:scale-110 ring-2 ring-offset-2 ring-gray-400' : 'w-10 h-10 rounded-full transition-transform hover:scale-110'}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Assign to Bookmarks <span className="text-sm font-normal text-gray-500">(optional)</span>
            </label>
            <div className="relative">
              <Input
                value={bookmarkSearchQuery}
                onChange={(e) => setBookmarkSearchQuery(e.target.value)}
                placeholder="Search bookmarks..."
                className="pl-10"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx={11} cy={11} r={8} strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
              </svg>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {bookmarksLoading ? (
              <div className="p-4 text-center text-sm text-gray-500">Loading bookmarks...</div>
            ) : availableBookmarks.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No bookmarks found. Create some bookmarks first!</div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {availableBookmarks
                  .filter(b => b.title.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()))
                  .map(bookmark => (
                    <div
                      key={bookmark.id}
                      onClick={() => toggleBookmarkSelection(bookmark.id)}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBookmarkIds.has(bookmark.id)}
                        onChange={() => toggleBookmarkSelection(bookmark.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {bookmark.title}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {bookmark.url}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setCreateModalOpen(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTag}
              className="flex-1"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white' }}
            >
              Create Tag
            </Button>
          </div>
        </div>
      </Modal>

      {/* Undo Toast for Deleted Tag */}
      {showUndoToast && deletedTag && (
        <UndoToast
          message={`"${deletedTag.name}" was deleted`}
          onUndo={undoDeleteTag}
          onExpired={() => {
            if (deletedTag) {
              permanentDeleteTag(deletedTag)
            }
            setDeletedTag(null)
          }}
          onClose={() => setShowUndoToast(false)}
          variant="danger"
        />
      )}
      </div>
    </DashboardLayout>
  )
}
