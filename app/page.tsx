import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { DashboardContent } from './dashboard-content'
import { DashboardLayout } from '@/components/dashboard-layout'

// Server component - fetches data server-side for fast initial render
async function getDashboardData() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  // Use getUser() instead of getSession() for security
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { bookmarks: [], collections: [], stats: { totalBookmarks: 0, favoritesCount: 0, unreadCount: 0 }, user: null }
  }

  // Use the optimized SQL function for all stats at once
  const [bookmarksRes, collectionsRes, statsRes] = await Promise.all([
    supabase.from('bookmarks').select('*').limit(5).order('created_at', { ascending: false }),
    supabase.from('collections').select('*'),
    // Try the optimized function first
    supabase.rpc('get_user_bookmark_stats', { p_user_id: user.id }),
  ])

  // If RPC failed, fall back to individual queries
  let stats = { totalBookmarks: 0, favoritesCount: 0, unreadCount: 0 }
  if (statsRes.data && Array.isArray(statsRes.data) && statsRes.data[0]) {
    stats = {
      totalBookmarks: statsRes.data[0].total_bookmarks || 0,
      favoritesCount: statsRes.data[0].favorites_count || 0,
      unreadCount: statsRes.data[0].unread_count || 0,
    }
  } else {
    // Fallback
    const [totalRes, favRes, unreadRes] = await Promise.all([
      supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_favorite', true),
      supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
    ])
    stats = {
      totalBookmarks: totalRes.count || 0,
      favoritesCount: favRes.count || 0,
      unreadCount: unreadRes.count || 0,
    }
  }

  return {
    bookmarks: bookmarksRes.data || [],
    collections: collectionsRes.data || [],
    stats,
    user,
  }
}

export default async function HomePage() {
  const data = await getDashboardData()

  // Redirect to login if not authenticated
  if (!data.user) {
    // Note: Middleware should handle this, but this is a fallback
    return null
  }

  return (
    <Suspense fallback={<DashboardLoadingSkeleton />}>
      <DashboardContent initialBookmarks={data.bookmarks} initialCollections={data.collections} initialStats={data.stats} />
    </Suspense>
  )
}

function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-8 pt-20">
      {/* Skeleton chart */}
      <div className="flex justify-between items-start gap-6">
        <div className="flex-1">
          <div className="h-12 bg-gray-200 rounded w-64 mb-2 animate-pulse" />
          <div className="h-6 bg-gray-200 rounded w-48 animate-pulse" />
        </div>
        <div className="w-40 h-40 rounded-full bg-gray-200 animate-pulse" />
      </div>

      {/* Skeleton buttons */}
      <div className="flex gap-3">
        <div className="h-10 bg-gray-200 rounded-lg w-40 animate-pulse" />
        <div className="h-10 bg-gray-200 rounded-lg w-48 animate-pulse" />
      </div>

      {/* Skeleton stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="p-6 rounded-lg bg-gray-200 animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-16 mb-2" />
            <div className="h-4 bg-gray-300 rounded w-24" />
          </div>
        ))}
      </div>

      {/* Skeleton quick actions */}
      <div>
        <div className="h-6 bg-gray-200 rounded w-40 mb-4 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-6 rounded-lg bg-gray-200 animate-pulse h-32" />
          ))}
        </div>
      </div>

      {/* Skeleton recent bookmarks */}
      <div>
        <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-lg bg-gray-200 animate-pulse h-20" />
          ))}
        </div>
      </div>
    </div>
  )
}
