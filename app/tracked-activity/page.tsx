'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import type { TabActivity } from '@/lib/types'

const ACTIVITIES_PER_PAGE = 50

export default function TrackedActivityPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<TabActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [userId, setUserId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getCurrentUser()
  }, [])

  // Reset and fetch new activities when date changes
  useEffect(() => {
    if (userId) {
      setActivities([])
      setPage(0)
      setHasMore(true)
      fetchActivities(0, true)
    }
  }, [userId, filterDate])

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserId(user.id)
    } else {
      router.push('/login')
    }
  }

  const fetchActivities = async (pageNum: number, reset = false) => {
    if (!userId) return

    if (reset) {
      setLoading(true)
    }

    const startIndex = pageNum * ACTIVITIES_PER_PAGE
    const startDate = new Date(filterDate + 'T00:00:00').toISOString()
    const endDate = new Date(filterDate + 'T23:59:59').toISOString()

    const { data, error } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', startDate)
      .lte('started_at', endDate)
      .order('started_at', { ascending: false })
      .range(startIndex, startIndex + ACTIVITIES_PER_PAGE - 1)

    if (!error && data) {
      if (reset) {
        setActivities(data)
      } else {
        setActivities(prev => [...prev, ...data])
      }
      setHasMore(data.length === ACTIVITIES_PER_PAGE)
    }

    setLoading(false)
  }

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1
          setPage(nextPage)
          fetchActivities(nextPage)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, loading, page])

  // Calculate statistics
  const totalTabs = activities.length
  const totalSeconds = activities.reduce((sum, a) => sum + (a.duration_seconds || 0), 0)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = (totalMinutes / 60).toFixed(1)

  // Group by domain
  const domainStats: Record<string, { count: number; seconds: number }> = {}
  activities.forEach(a => {
    const domain = a.domain || 'other'
    if (!domainStats[domain]) {
      domainStats[domain] = { count: 0, seconds: 0 }
    }
    domainStats[domain].count++
    domainStats[domain].seconds += a.duration_seconds || 0
  })

  const topDomains = Object.entries(domainStats)
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 10)

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const hrs = Math.floor(mins / 60)
    if (hrs > 0) {
      return `${hrs}h ${mins % 60}m`
    }
    return `${mins}m`
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Tracked Activity</h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              View your browsing history and time spent
            </p>
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-4 py-2 rounded-lg border cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Stats - Show immediately with current data */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-blue-600">{totalTabs}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Tabs Opened</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-green-600">{totalMinutes}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Minutes Tracked</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-purple-600">{totalHours}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Hours Total</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Domains */}
        {topDomains.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Top Websites Today</h2>
              <div className="space-y-3">
                {topDomains.map(([domain, stats]) => (
                  <div key={domain} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                        className="w-5 h-5 rounded"
                        alt=""
                        loading="lazy"
                      />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{domain}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{stats.count} visits</span>
                      <span className="font-medium text-green-600">{formatDuration(stats.seconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Activity List with infinite scroll */}
        {loading && activities.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
              No activity tracked for this date yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Activity Timeline</h2>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Showing {activities.length} {activities.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <div className="space-y-3">
                {activities.map(activity => (
                  <div
                    key={activity.id}
                    className="p-4 rounded-lg hover:bg-gray-50 transition-all duration-75"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <div className="flex items-start gap-4">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${activity.domain}&sz=32`}
                        className="w-8 h-8 rounded"
                        alt=""
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {activity.title || activity.url}
                        </p>
                        <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{activity.url}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-medium text-green-600">{formatDuration(activity.duration_seconds)}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatTime(activity.started_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load more indicator / observer target */}
              {hasMore && (
                <div ref={observerTarget} className="py-4 text-center">
                  {loading && (
                    <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
