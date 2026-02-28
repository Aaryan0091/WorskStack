'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getExtensionId, isExtensionInstalledViaContentScript } from '@/lib/extension-detect'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import type { TabActivity } from '@/lib/types'

type TimeFilter = 'today' | 'week' | 'month' | 'all'

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
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null)

  // Helper to generate better display titles
  const getDisplayTitle = (url: string, title: string) => {
    // If title is just domain, try to generate something better
    const domain = getDomain(url)
    if (title === domain || title === url) {
      try {
        const urlObj = new URL(url)
        // For YouTube videos, extract video ID and show "YouTube Video"
        if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
          if (urlObj.pathname === '/watch') {
            const videoId = urlObj.searchParams.get('v')
            return videoId ? `YouTube Video (${videoId.slice(0, 8)}...)` : 'YouTube Video'
          }
          if (urlObj.pathname.startsWith('/@')) {
            return `YouTube - ${urlObj.pathname.slice(1)}`
          }
          if (urlObj.pathname.startsWith('/c/')) {
            return `YouTube - ${urlObj.pathname.slice(3)}`
          }
        }
        // For other sites, show a better title
        return `${urlObj.hostname} - ${urlObj.pathname.slice(1) || 'home'}`
      } catch {
        return title || url
      }
    }
    return title || url
  }

  const clearHistory = async () => {
    const confirmed = confirm('Are you sure you want to clear your tracked activity history? This cannot be undone.')
    if (!confirmed) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/activity/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({})
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          // Refresh activities to reflect the clear
          setActivities([])
          alert('Activity history cleared successfully!')
        }
      }
    } catch (error) {
      alert('Failed to clear history. Please try again.')
    }
  }

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserId(user.id)
    } else {
      router.push('/login')
    }
  }

  const fetchActivities = async () => {
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Use the list API which returns only the latest entry per tab per session
      const response = await fetch('/api/activity/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({})
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setActivities(result.data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error)
    }

    setLoading(false)
  }

  const checkTrackingStatus = () => {
    const chromeWindow = window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb: (r: { isTracking?: boolean } | undefined) => void) => void; lastError?: { message?: string } } } }
    if (typeof window !== 'undefined' && chromeWindow.chrome?.runtime) {
      const extensionId = getExtensionId()
      if (!extensionId) return

      chromeWindow.chrome.runtime?.sendMessage?.(
        extensionId,
        { action: 'getStatus' },
        (response: { isTracking?: boolean } | undefined) => {
          if (response && !(chromeWindow.chrome?.runtime?.lastError)) {
            if (response.isTracking !== undefined) setIsTracking(response.isTracking)
          }
        }
      )
    }
  }

  const checkExtensionStatus = () => {
    if (typeof window !== 'undefined') {
      const installed = isExtensionInstalledViaContentScript()
      setExtensionInstalled(installed)
    }
  }

  useEffect(() => {
    getCurrentUser()
    checkExtensionStatus()
    fetchActivities()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Filter activities based on time period (fixed for timezone)
  const filteredActivities = useMemo(() => {
    const now = new Date()

    return activities.filter(item => {
      if (!item.started_at) return false

      // Convert UTC timestamp to local date for comparison
      const itemDate = new Date(item.started_at)
      const itemLocalDate = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate())

      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      // Get start of current week (Sunday)
      const startOfWeek = new Date(today)
      const dayOfWeek = startOfWeek.getDay()
      startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)
      startOfWeek.setHours(0, 0, 0, 0)

      // Get start of current month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      startOfMonth.setHours(0, 0, 0, 0)

      switch (timeFilter) {
        case 'today':
          return itemLocalDate.getTime() === today.getTime()
        case 'week':
          return itemLocalDate >= startOfWeek
        case 'month':
          return itemLocalDate >= startOfMonth
        case 'all':
          return true
        default:
          return true
      }
    })
  }, [activities, timeFilter])

  const totalSeconds = filteredActivities.reduce((sum, item) => sum + (item.duration_seconds || 0), 0)
  const totalMinutes = (totalSeconds / 60).toFixed(1)
  const totalHours = (totalSeconds / 3600).toFixed(1)
  const uniqueSitesCount = filteredActivities.length

  // Group activities by full URL (each unique URL shows separately)
  const groupedActivities = useMemo(() => {
    const groups = new Map<string, GroupedActivity>()

    filteredActivities.forEach(item => {
      const urlKey = item.url

      if (!groups.has(urlKey)) {
        groups.set(urlKey, {
          domain: getDomain(item.url),
          url: item.url,
          title: item.title || item.url,
          totalSeconds: item.duration_seconds || 0,
          visitCount: 1,
          lastVisited: item.started_at || ''
        })
      } else {
        const existing = groups.get(urlKey)!
        existing.totalSeconds += item.duration_seconds || 0
        existing.visitCount += 1
        if (item.started_at && item.started_at > existing.lastVisited) {
          existing.lastVisited = item.started_at
        }
        if (item.title && item.started_at >= existing.lastVisited) {
          existing.title = item.title
        }
      }
    })

    // Convert to array and sort by total time spent (descending)
    return Array.from(groups.values()).sort((a, b) => b.totalSeconds - a.totalSeconds)
  }, [filteredActivities])

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
          {extensionInstalled === false && (
            <button
              onClick={() => router.push('/extension')}
              className="px-4 py-2.5 rounded-lg font-medium transition-all duration-200 hover:scale-105"
              style={{ backgroundColor: 'var(--color-primary)', color: 'white', cursor: 'pointer' }}
            >
              Download Extension
            </button>
          )}
        </div>

        {/* Time Filter Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(['today', 'week', 'month'] as TimeFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-4 py-2.5 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
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
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div
                      className="p-4 rounded-lg border transition-all duration-75 hover:scale-[1.02] hover:shadow-lg"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                      }}
                    >
                      <div className="flex items-start gap-4">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${getDomain(item.url)}&sz=32`}
                          className="w-10 h-10 rounded flex-shrink-0"
                          alt=""
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate hover:text-blue-600 transition-colors" style={{ color: 'var(--text-primary)' }}>
                              {getDisplayTitle(item.url, item.title)}
                            </p>
                            {item.visitCount > 1 && (
                              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
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
