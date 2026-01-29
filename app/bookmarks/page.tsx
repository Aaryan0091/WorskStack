'use client'

import { useEffect, useState } from 'react'
import { BookmarksList } from './bookmarks-list'
import { BookmarksHeader } from './bookmarks-header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { supabase } from '@/lib/supabase'
import type { Bookmark, Tag } from '@/lib/types'

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [bookmarkTags, setBookmarkTags] = useState<Record<string, Tag[]>>({})
  const [loading, setLoading] = useState(true)
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    async function fetchData() {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Logged in - fetch from Supabase cloud
        const [bookmarksRes, tagsRes, bookmarkTagsRes] = await Promise.all([
          supabase.from('bookmarks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('tags').select('*').eq('user_id', user.id).order('name', { ascending: true }),
          supabase.from('bookmark_tags').select('bookmark_id, tags(*)'),
        ])

        if (bookmarksRes.data) setBookmarks(bookmarksRes.data)
        if (tagsRes.data) setTags(tagsRes.data)

        const tagMap: Record<string, Tag[]> = {}
        bookmarkTagsRes.data?.forEach((bt: any) => {
          if (bt.tags) {
            if (!tagMap[bt.bookmark_id]) tagMap[bt.bookmark_id] = []
            tagMap[bt.bookmark_id].push(bt.tags)
          }
        })
        setBookmarkTags(tagMap)
      } else {
        // Guest mode - load from sessionStorage (temporary data, lost when browser closes)
        try {
          const storedBookmarks = sessionStorage.getItem('workstack_guest_bookmarks')
          if (storedBookmarks) {
            setBookmarks(JSON.parse(storedBookmarks))
          }
        } catch (e) {
          setBookmarks([])
        }
        setIsGuest(true)
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <BookmarksHeader isGuest={false} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-gray-300" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-300 rounded mb-2 w-3/4" />
                    <div className="h-3 bg-gray-300 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BookmarksHeader isGuest={isGuest} />
        <BookmarksList
          initialBookmarks={bookmarks}
          initialTags={tags}
          initialBookmarkTags={bookmarkTags}
          isGuest={isGuest}
        />
      </div>
    </DashboardLayout>
  )
}
