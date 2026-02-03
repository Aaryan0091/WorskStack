'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getExtensionId } from '@/lib/extension-detect'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import type { TabActivity } from '@/lib/types'

type TimeFilter = 'today' | 'week' | 'month'

interface GroupedActivity {
  domain: string
  url: string
  title: string
  totalSeconds: number
  visitCount: number
  lastVisited: string
}

export default function TrackedActivityPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<TabActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today')

  useEffect(() => {
    getCurrentUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (userId) {
      fetchActivities()
      checkTrackingStatus()

      // Poll for updates every 3 seconds
      const interval = setInterval(() => {
        fetchActivities()
        checkTrackingStatus()
      }, 3000)

      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserId(user.id)
    } else {
      router.push('/login')
    }
  }

  const checkTrackingStatus = () => {
    if (typeof window !== 'undefined' && (window as { chrome?: { runtime: { sendMessage: (extensionId: string, message: { action: string }, callback: (response: { isTracking: boolean }) => void) => void; lastError?: unknown } } }).chrome) {
      const extensionId = getExtensionId()
      if (!extensionId) return

      const chromeWindow = window as { chrome?: { runtime: { sendMessage: (extensionId: string, message: { action: string }, callback: (response: { isTracking: boolean }) => void) => void; lastError?: unknown } } }
      chromeWindow.chrome!.runtime.sendMessage(
        extensionId,
        { action: 'getStatus' },
        (response: { isTracking: boolean }) => {
          if (response && !chromeWindow.chrome!.runtime.lastError) {
            setIsTracking(response.isTracking)
          }
        }
      )
    }
  }

  const fetchActivities = async () => {
    if (!userId) return
    setLoading(true)

    const { data, error } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })

    if (!error && data) {
      setActivities(data)
    }

    setLoading(false)
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60)
      return `${hrs}h ${mins % 60}m`
    }
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  // Filter activities based on time period
  const filteredActivities = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Get start of current week (Sunday)
    const startOfWeek = new Date(today)
    const dayOfWeek = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)
    startOfWeek.setHours(0, 0, 0, 0)

    // Get start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    startOfMonth.setHours(0, 0, 0, 0)

    return activities.filter(item => {
      if (!item.started_at) return false
      const itemDate = new Date(item.started_at)

      switch (timeFilter) {
        case 'today':
          return itemDate >= today
        case 'week':
          return itemDate >= startOfWeek
        case 'month':
          return itemDate >= startOfMonth
        default:
          return true
      }
    })
  }, [activities, timeFilter])

  // Group activities by domain
  const groupedActivities = useMemo(() => {
    const groups = new Map<string, GroupedActivity>()

    filteredActivities.forEach(item => {
      const domain = getDomain(item.url)

      if (!groups.has(domain)) {
        groups.set(domain, {
          domain,
          url: item.url,
          title: item.title || item.url,
          totalSeconds: item.duration_seconds || 0,
          visitCount: 1,
          lastVisited: item.started_at || ''
        })
      } else {
        const existing = groups.get(domain)!
        existing.totalSeconds += item.duration_seconds || 0
        existing.visitCount += 1
        // Keep the most recent last visited date
        if (item.started_at && item.started_at > existing.lastVisited) {
          existing.lastVisited = item.started_at
        }
        // Keep the most recent title
        if (item.title && item.started_at >= existing.lastVisited) {
          existing.title = item.title
        }
      }
    })

    // Convert to array and sort by total time spent (descending)
    return Array.from(groups.values()).sort((a, b) => b.totalSeconds - a.totalSeconds)
  }, [filteredActivities])

  const totalSeconds = groupedActivities.reduce((sum, a) => sum + a.totalSeconds, 0)
  const totalMinutes = (totalSeconds / 60).toFixed(1)
  const totalHours = (totalSeconds / 3600).toFixed(1)
  const uniqueSitesCount = groupedActivities.length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Tracked Activity
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              {isTracking ? 'Currently tracking tabs' : 'Last tracked session (tracking stopped)'}
            </p>
          </div>
        </div>

        {/* Time Filter Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(['today', 'week', 'month'] as TimeFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                  timeFilter === filter
                    ? 'bg-blue-600 text-white'
                    : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: timeFilter !== filter ? 'var(--bg-secondary)' : undefined,
                  color: timeFilter !== filter ? 'var(--text-primary)' : undefined
                }}
              >
                {filter === 'today' ? 'Today' : filter === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>

          {/* Date range display */}
          <span className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            {(() => {
              const now = new Date()
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
              const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

              if (timeFilter === 'today') {
                return `Showing: ${today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
              } else if (timeFilter === 'week') {
                const startOfWeek = new Date(today)
                const dayOfWeek = startOfWeek.getDay()
                startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)
                const endOfWeek = new Date(startOfWeek)
                endOfWeek.setDate(endOfWeek.getDate() + 6)
                return `Showing: ${startOfWeek.toLocaleDateString('en-US', options)} - ${endOfWeek.toLocaleDateString('en-US', options)}`
              } else {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
                return `Showing: ${startOfMonth.toLocaleDateString('en-US', { month: 'long' })} 1 - ${endOfMonth.getDate()}`
              }
            })()}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-blue-600">{uniqueSitesCount}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Unique Sites</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-green-600">{totalMinutes}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Total Minutes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-purple-600">{totalHours}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Total Hours</p>
            </CardContent>
          </Card>
        </div>

        {loading && activities.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-4 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />
            ))}
          </div>
        ) : groupedActivities.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
              {activities.length === 0
                ? 'No tracked activity yet. Click "Track Activity" on the dashboard to start.'
                : 'No tracked activity for this time period.'}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                {groupedActivities.map((item) => (
                  <a
                    key={item.domain}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div
                      className="p-4 rounded-lg transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    >
                      <div className="flex items-center gap-4">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`}
                          className="w-10 h-10 rounded flex-shrink-0"
                          alt=""
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate hover:text-blue-600 transition-colors" style={{ color: 'var(--text-primary)' }}>
                              {item.title}
                            </p>
                            {item.visitCount > 1 && (
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                                {item.visitCount} {item.visitCount === 1 ? 'visit' : 'visits'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.domain}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="font-semibold text-green-600">
                            {formatDuration(item.totalSeconds)}
                          </span>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            total time
                          </p>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
