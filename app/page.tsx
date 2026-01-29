import { Suspense } from 'react'
import { DashboardContent } from './dashboard-content'
import { DashboardLayout } from '@/components/dashboard-layout'

export default function HomePage() {
  // Allow guest users - no server-side data fetching needed
  // DashboardContent will handle guest mode vs logged in mode client-side
  return (
    <Suspense fallback={<DashboardLoadingSkeleton />}>
      <DashboardContent initialBookmarks={[]} initialCollections={[]} initialStats={{ totalBookmarks: 0, favoritesCount: 0, unreadCount: 0 }} />
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
