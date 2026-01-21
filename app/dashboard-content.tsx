'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isChromiumBased } from '@/lib/browser-detect'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { BookmarkMenu } from '@/components/bookmark-menu'
import type { Bookmark, Collection } from '@/lib/types'

// Simple Pie Chart component
interface PieChartProps {
  data: { label: string; value: number; color: string }[]
}

function PieChart({ data }: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const size = 160
  const strokeWidth = 22
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const containerHeight = 160

  let currentAngle = 0

  const getCoordinates = (angle: number) => {
    const radians = (angle - 90) * (Math.PI / 180)
    return {
      x: center + radius * Math.cos(radians),
      y: center + radius * Math.sin(radians),
    }
  }

  const slices = data.map((item) => {
    if (item.value === 0) return null
    const percentage = (item.value / total) * 100
    const angle = (item.value / total) * 360

    const start = getCoordinates(currentAngle)
    const end = getCoordinates(currentAngle + angle)
    const largeArc = angle > 180 ? 1 : 0

    currentAngle += angle

    // If it's a full circle (100%)
    if (percentage === 100) {
      return (
        <circle
          key={item.label}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={item.color}
          strokeWidth={strokeWidth}
          style={{ filter: 'drop-shadow(0 0 6px ' + item.color + '50)' }}
        />
      )
    }

    return (
      <path
        key={item.label}
        d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`}
        fill="none"
        stroke={item.color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 6px ' + item.color + '50)' }}
      />
    )
  })

  return (
    <div className="flex items-center gap-5" style={{ height: containerHeight }}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Subtle glow behind */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-20"
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #a855f7, #f97316)',
            transform: 'scale(0.7)'
          }}
        />
        <svg width={size} height={size} className="flex-shrink-0 relative">
          {slices}
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xl font-bold"
            style={{ fill: 'var(--text-primary)' }}
          >
            {total}
          </text>
        </svg>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                backgroundColor: item.color,
                boxShadow: '0 0 8px ' + item.color + '50',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>: <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Simple Bar Chart component
function BarChart({ data }: PieChartProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1)
  const barWidth = 32
  const chartHeight = 120
  const gap = 12
  const containerHeight = 160

  return (
    <div className="flex items-center gap-5" style={{ height: containerHeight }}>
      <div className="relative flex items-end" style={{ width: barWidth * data.length + gap * (data.length - 1) + 40, height: containerHeight }}>
        <svg width="100%" height="100%" className="flex-shrink-0 relative" style={{ overflow: 'visible' }}>
          {data.map((item, index) => {
            const barHeight = (item.value / maxValue) * chartHeight
            const x = index * (barWidth + gap) + 20
            const y = containerHeight - 20 - barHeight

            return (
              <g key={item.label}>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={item.color}
                  rx={4}
                  style={{ filter: 'drop-shadow(0 0 6px ' + item.color + '50)' }}
                />
                {/* Value on top */}
                <text
                  x={x + barWidth / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="text-xs font-bold"
                  style={{ fill: 'var(--text-primary)' }}
                >
                  {item.value}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{
                backgroundColor: item.color,
                boxShadow: '0 0 8px ' + item.color + '50',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Chart Container with toggle button
interface ChartWithToggleProps {
  data: { label: string; value: number; color: string }[]
}

function ChartWithToggle({ data }: ChartWithToggleProps) {
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie')

  return (
    <div className="flex flex-col items-center gap-3">
      {chartType === 'pie' ? <PieChart data={data} /> : <BarChart data={data} />}
      <button
        onClick={() => setChartType(chartType === 'pie' ? 'bar' : 'pie')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-75 active:scale-90"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          cursor: 'pointer'
        }}
      >
        {chartType === 'pie' ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Bar Chart
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            Pie Chart
          </>
        )}
      </button>
    </div>
  )
}

const EXTENSION_ID = 'llahljdmcglglkcaadldnbpcpnkdinco'

export function DashboardContent({ initialBookmarks, initialCollections, initialStats }: { initialBookmarks: Bookmark[]; initialCollections: Collection[]; initialStats: { totalBookmarks: number; favoritesCount: number; unreadCount: number } }) {
  const router = useRouter()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks)
  const [collections, setCollections] = useState<Collection[]>(initialCollections)
  // Combined counts state for atomic updates - initialized from server-side data
  const [counts, setCounts] = useState(initialStats)
  const [isTracking, setIsTracking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [hasSavedSession, setHasSavedSession] = useState(false)
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null)
  const [showExtensionModal, setShowExtensionModal] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [showPreviousActivityModal, setShowPreviousActivityModal] = useState(false)
  const [previousActivityData, setPreviousActivityData] = useState<Array<{
    id: string
    url: string
    title: string
    domain: string
    duration_seconds: number
    started_at: string
    ended_at: string | null
  }>>([])
  const [loadingPreviousActivity, setLoadingPreviousActivity] = useState(false)
  const [sessionTabs, setSessionTabs] = useState<Array<{
    url: string
    title: string
    domain: string
    duration_seconds: number
  }>>([])
  const [browserSupportsExtension, setBrowserSupportsExtension] = useState<boolean | null>(null)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Fetch fresh data from server
  const fetchFreshData = async () => {
    // Get user token for API call
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return

    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    // Fetch stats from single optimized endpoint
    const statsPromise = fetch('/api/stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }).then(res => res.json())

    // Fetch other data in parallel
    const [recentBookmarksRes, collectionsRes, statsData] = await Promise.all([
      supabase.from('bookmarks').select('*').limit(5).order('created_at', { ascending: false }),
      supabase.from('collections').select('*'),
      statsPromise,
    ])

    // Update counts atomically from single response
    setCounts({
      totalBookmarks: statsData.total_bookmarks ?? 0,
      favoritesCount: statsData.favorites_count ?? 0,
      unreadCount: statsData.unread_count ?? 0,
    })

    if (recentBookmarksRes.data) setBookmarks(recentBookmarksRes.data)
    if (collectionsRes.data) setCollections(collectionsRes.data)
  }

  // Check extension on mount (after hydration)
  useEffect(() => {
    // Detect browser support (client-side only to avoid hydration mismatch)
    setBrowserSupportsExtension(isChromiumBased())

    checkExtensionInstalled()
    // Store auth token in extension on page load
    storeAuthTokenInExtension()
    // Fetch fresh data on mount
    fetchFreshData()

    // Listen for auth state changes and sync token to extension
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      console.log('Auth state changed:', event, session?.access_token ? 'token present' : 'no token')
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Use the session from the event directly
        if (session?.access_token) {
          storeAuthTokenToExtension(session.access_token)
        }
      }
    })

    // Set up realtime subscription for instant updates
    const setupRealtime = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) return

      const user = data.user
      const channel = supabase
        .channel('bookmarks-changes')
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'bookmarks',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            console.log('Bookmarks changed, refreshing...')
            fetchFreshData()
          }
        )
        .subscribe()

      channelRef.current = channel
    }

    setupRealtime()

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
      subscription.unsubscribe()
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  // Store auth token in extension
  const storeAuthTokenToExtension = (token: string) => {
    const chrome = (window as any).chrome
    if (!chrome?.runtime) return

    let responded = false
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true
        console.log('Extension token sync: timeout (extension not installed)')
      }
    }, 500)

    chrome.runtime.sendMessage(EXTENSION_ID, {
      action: 'storeAuthToken',
      authToken: token,
      apiBaseUrl: window.location.origin
    }, (response: any) => {
      if (responded) return
      responded = true
      clearTimeout(timeout)

      if (chrome.runtime.lastError) {
        console.log('Extension not reachable')
      } else {
        console.log('Auth token synced to extension')
      }
    })
  }

  const storeAuthTokenInExtension = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.session?.access_token) {
      storeAuthTokenToExtension(session.session.access_token)
    }
  }

  const checkExtensionInstalled = () => {
    if (typeof window === 'undefined' || !(window as any).chrome?.runtime) {
      setExtensionInstalled(false)
      return
    }

    const chrome = (window as any).chrome
    let responded = false

    // Set a timeout to fail fast if extension doesn't respond
    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true
        setExtensionInstalled(false)
      }
    }, 500) // Fail fast after 500ms

    chrome.runtime.sendMessage(EXTENSION_ID, { action: 'ping' }, (response: any) => {
      if (responded) return // Already timed out
      responded = true
      clearTimeout(timeout)

      if (chrome.runtime.lastError) {
        setExtensionInstalled(false)
      } else if (response?.success) {
        setExtensionInstalled(true)
        checkExtensionStatus()
        checkIntervalRef.current = setInterval(checkExtensionStatus, 2000)
      } else {
        setExtensionInstalled(false)
      }
    })
  }

  const checkExtensionStatus = () => {
    const chrome = (window as any).chrome
    if (!chrome?.runtime) return

    chrome.runtime.sendMessage(EXTENSION_ID, { action: 'getStatus' }, (response: any) => {
      if (response && !chrome.runtime.lastError) {
        setIsTracking(response.isTracking)
        setIsPaused(response.isPaused || false)
        setHasSavedSession(response.hasSavedSession || false)
        if (response.sessionTabs) {
          setSessionTabs(response.sessionTabs)
        }
      }
    })
  }

  const startTracking = async () => {
    if (extensionInstalled === false) {
      setShowExtensionModal(true)
      return
    }
    setShowPermissionModal(true)
  }

  const confirmStartTracking = async () => {
    setShowPermissionModal(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    const apiBaseUrl = window.location.origin
    const chrome = (window as any).chrome

    // First store the auth token, then start tracking
    if (session?.session?.access_token) {
      storeAuthTokenToExtension(session.session.access_token)
    }

    chrome.runtime.sendMessage(EXTENSION_ID, {
      action: 'startTracking',
      userId: user.id,
      authToken: session?.access_token,
      apiBaseUrl
    }, (response: any) => {
      if (response?.success) {
        setIsTracking(true)
        setIsPaused(false)
      }
    })
  }

  const stopTracking = () => {
    const chrome = (window as any).chrome
    if (!chrome?.runtime) return

    chrome.runtime.sendMessage(EXTENSION_ID, { action: 'stopTracking' }, (response: any) => {
      if (response?.success) {
        setIsTracking(false)
        setIsPaused(false)
        setSessionTabs([])
        setTimeout(() => checkExtensionStatus(), 100)
      }
    })
  }

  const resumeActivity = () => {
    const chrome = (window as any).chrome
    if (!chrome?.runtime) return

    chrome.runtime.sendMessage(EXTENSION_ID, { action: 'openSavedTabs' }, (response: any) => {
      if (response?.success) {
        // Tabs opened but tracking not started
        console.log('Saved tabs opened')
      }
    })
  }

  const showPreviousActivity = async () => {
    setShowPreviousActivityModal(true)
    setLoadingPreviousActivity(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch tab_activity records, grouped by session date
      const { data } = await supabase
        .from('tab_activity')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(100)

      if (data) {
        setPreviousActivityData(data)
      }
    } catch (error) {
      console.error('Error fetching previous activity:', error)
    } finally {
      setLoadingPreviousActivity(false)
    }
  }

  const pauseTracking = () => {
    const chrome = (window as any).chrome
    if (!chrome?.runtime) return

    chrome.runtime.sendMessage(EXTENSION_ID, { action: 'pauseTracking' }, (response: any) => {
      if (response?.success) {
        setIsPaused(true)
      }
    })
  }

  const resumeTracking = () => {
    const chrome = (window as any).chrome
    if (!chrome?.runtime) return

    chrome.runtime.sendMessage(EXTENSION_ID, { action: 'resumeTracking' }, (response: any) => {
      if (response?.success) {
        setIsPaused(false)
      }
    })
  }

  // Bookmark action functions
  const toggleFavorite = async (bookmark: Bookmark) => {
    await supabase.from('bookmarks').update({ is_favorite: !bookmark.is_favorite }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_favorite: !b.is_favorite } : b))
    fetchFreshData()
  }

  const toggleRead = async (bookmark: Bookmark) => {
    await supabase.from('bookmarks').update({ is_read: !bookmark.is_read }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_read: !b.is_read } : b))
    fetchFreshData()
  }

  const deleteBookmark = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
    setBookmarks(bookmarks.filter(b => b.id !== id))
    fetchFreshData()
  }

  const stats = {
    total: counts.totalBookmarks,
    unread: counts.unreadCount,
    favorites: counts.favoritesCount,
    collections: collections.length,
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const hrs = Math.floor(mins / 60)
    if (hrs > 0) return `${hrs}h ${mins % 60}m`
    if (mins > 0) return `${mins}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-start gap-6" style={{ position: 'relative' }}>
          <div style={{ paddingTop: '5rem' }}>
            <h1 className="text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Welcome to WorkStack
            </h1>
            <p className="mt-2 text-xl" style={{ color: 'var(--text-secondary)' }}>
              Your personal bookmark manager
            </p>
          </div>
          <div className="mt-6">
            <ChartWithToggle
              data={[
                { label: 'Bookmarks', value: stats.total, color: '#3b82f6' },
                { label: 'To Read', value: stats.unread, color: '#f97316' },
                { label: 'Favorites', value: stats.favorites, color: '#eab308' },
                { label: 'Collections', value: stats.collections, color: '#a855f7' },
              ]}
            />
          </div>
        </div>

        {/* Track Activity Section */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isTracking ? (
              <>
                <button
                  onClick={startTracking}
                  className="px-4 py-2 rounded-lg font-medium transition-all duration-75 active:scale-90 hover:scale-105 flex items-center gap-2"
                  style={{ backgroundColor: '#22c55e', color: 'white', cursor: 'pointer' }}
                >
                  <span>🎯 Track Activity</span>
                </button>
                {hasSavedSession && (
                  <>
                    <button
                      onClick={resumeActivity}
                      className="px-4 py-2 rounded-lg font-medium transition-all duration-75 active:scale-90 hover:scale-105 flex items-center gap-2"
                      style={{ backgroundColor: '#3b82f6', color: 'white', cursor: 'pointer' }}
                    >
                      <span>📂 Resume Previous Activity</span>
                    </button>
                    <button
                      onClick={showPreviousActivity}
                      className="px-4 py-2 rounded-lg font-medium transition-all duration-75 active:scale-90 hover:scale-105 flex items-center gap-2"
                      style={{ backgroundColor: '#8b5cf6', color: 'white', cursor: 'pointer' }}
                    >
                      <span>📊 Show Previous Activity</span>
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={isPaused ? resumeTracking : pauseTracking}
                  className="px-4 py-2 rounded-lg font-medium transition-all duration-75 active:scale-90 hover:scale-105 flex items-center gap-2"
                  style={{ backgroundColor: isPaused ? '#22c55e' : '#f59e0b', color: 'white', cursor: 'pointer' }}
                >
                  {isPaused ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                      Resume
                    </>
                  ) : (
                    'Pause'
                  )}
                </button>
                <button
                  onClick={stopTracking}
                  className="px-4 py-2 rounded-lg font-medium transition-all duration-75 active:scale-90 hover:scale-105"
                  style={{ backgroundColor: '#ef4444', color: 'white', cursor: 'pointer' }}
                >
                  Stop
                </button>
              </>
            )}

            {/* Extension status */}
            {browserSupportsExtension === false ? (
              <span className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', color: '#f59e0b' }}>
                ⚠️ Extension requires Chrome/Edge/Brave
              </span>
            ) : browserSupportsExtension === true && extensionInstalled === false ? (
              <button
                onClick={() => router.push('/extension')}
                className="px-4 py-2 rounded-lg font-medium transition-all duration-75 active:scale-90 flex items-center gap-2"
                style={{ backgroundColor: '#8b5cf6', color: 'white', cursor: 'pointer' }}
              >
                <span>📥 Download Extension</span>
              </button>
            ) : extensionInstalled === true && !isTracking ? (
              <span className="text-sm" style={{ color: '#22c55e' }}>✓ Extension ready</span>
            ) : null}

            {isTracking && !isPaused && (
              <span className="text-sm" style={{ color: '#22c55e' }}>● Recording</span>
            )}
            {isTracking && isPaused && (
              <span className="text-sm" style={{ color: '#f59e0b' }}>●● Paused</span>
            )}

            {isTracking && (
              <button
                onClick={() => router.push('/tracked-activity')}
                className="px-3 py-2 rounded-lg text-sm transition-all duration-75 active:scale-90"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                View Activity
              </button>
            )}
          </div>

          {/* Session Tabs List */}
          {isTracking && sessionTabs.length > 0 && (
            <div className="mt-4 rounded-lg border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', maxHeight: '400px', overflow: 'hidden' }}>
              <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  📊 Tracked Tabs ({sessionTabs.length})
                </h3>
                <span className={`text-xs ${isPaused ? 'text-orange-600' : 'text-green-600'}`}>
                  {isPaused ? 'Paused' : 'Live'}
                </span>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '340px' }}>
                {sessionTabs.map((tab, index) => (
                  <div
                    key={index}
                    className="p-3 border-b hover:bg-gray-50 transition-colors duration-150"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(tab.url)}&sz=32`}
                        className="w-5 h-5 rounded mt-0.5 flex-shrink-0"
                        alt=""
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{tab.title}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{tab.url}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-sm font-medium text-green-600">{formatDuration(tab.duration_seconds)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tracking Active Indicator */}
          {isTracking && sessionTabs.length === 0 && (
            <div className="mt-4 p-4 rounded-lg" style={{
              backgroundColor: isPaused ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)',
              border: isPaused ? '1px solid #f59e0b' : '1px solid #22c55e'
            }}>
              <p className={`text-center ${isPaused ? 'text-orange-600' : 'text-green-600'}`}>
                {isPaused ? '⏸️ Tracking paused - click Resume to continue' : '🟢 Tracking active - open some tabs!'}
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Total Bookmarks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-orange-600">{stats.unread}</p>
              <p style={{ color: 'var(--text-secondary)' }}>To Read</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-yellow-600">{stats.favorites}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Favorites</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-purple-600">{stats.collections}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Collections</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/bookmarks')}
              className="p-6 rounded-lg text-left hover:shadow-md transition-all duration-75 hover:scale-105 active:scale-95"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', cursor: 'pointer' }}
            >
              <span className="text-3xl">🔖</span>
              <h3 className="font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>Add Bookmark</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Save a new link</p>
            </button>
            <button
              onClick={() => router.push('/reading-list')}
              className="p-6 rounded-lg text-left hover:shadow-md transition-all duration-75 hover:scale-105 active:scale-95"
              style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', cursor: 'pointer' }}
            >
              <span className="text-3xl">📚</span>
              <h3 className="font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>Reading List</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{stats.unread} unread items</p>
            </button>
            <button
              onClick={() => router.push('/collections')}
              className="p-6 rounded-lg text-left hover:shadow-md transition-all duration-75 hover:scale-105 active:scale-95"
              style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', cursor: 'pointer' }}
            >
              <span className="text-3xl">📦</span>
              <h3 className="font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>Collections</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Organize & share</p>
            </button>
          </div>
        </div>

        {/* Recent Bookmarks */}
        <div>
          <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Recent Bookmarks</h2>
          {bookmarks.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                No bookmarks yet. Start by adding your first one!
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-3">
                {bookmarks.slice(0, 3).map(bookmark => (
                  <Card
                    key={bookmark.id}
                    className="hover:shadow-md transition-all duration-75 hover:scale-[1.02] active:scale-100 cursor-pointer"
                    onClick={() => window.open(bookmark.url, '_blank')}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`}
                          className="w-8 h-8 rounded flex-shrink-0"
                          alt=""
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium hover:text-blue-600 truncate block" style={{ color: 'var(--text-primary)' }}>
                            {bookmark.title}
                          </div>
                          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{bookmark.url}</p>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <BookmarkMenu
                            bookmarkId={bookmark.id}
                            isFavorite={bookmark.is_favorite}
                            isRead={bookmark.is_read}
                            onToggleFavorite={() => toggleFavorite(bookmark)}
                            onToggleReadingList={() => toggleRead(bookmark)}
                            onEdit={() => router.push(`/bookmarks?edit=${bookmark.id}`)}
                            onDelete={() => deleteBookmark(bookmark.id)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {bookmarks.length > 3 && (
                <button
                  onClick={() => router.push('/bookmarks')}
                  className="w-full mt-4 p-4 rounded-lg font-medium transition-all duration-75 hover:scale-[1.02] active:scale-100 text-center"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Click to view all bookmarks
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Extension Installation Modal */}
      <Modal isOpen={showExtensionModal} onClose={() => setShowExtensionModal(false)} title="Install Extension">
        <div className="space-y-4">
          <p style={{ color: 'var(--text-secondary)' }}>
            To track your browsing activity, you need to install the WorkStack Tab Tracker extension.
          </p>
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Installation Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>Open Chrome and go to <code className="bg-gray-200 px-1 rounded">chrome://extensions/</code></li>
              <li>Enable "Developer mode" (top right toggle)</li>
              <li>Click "Load unpacked" button</li>
              <li>Select the <code className="bg-gray-200 px-1 rounded">workstack-extension</code> folder</li>
              <li>Come back and click "Track Activity" again</li>
            </ol>
          </div>
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <p className="text-sm" style={{ color: '#1e40af' }}>
              <strong>Note:</strong> The extension folder is at <code className="bg-white px-1 rounded">/Users/aaryangupta/Desktop/workstack-extension/</code>
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setShowExtensionModal(false)} className="flex-1">Got it</Button>
            <Button variant="secondary" onClick={() => {
              setShowExtensionModal(false)
              checkExtensionInstalled()
            }} className="flex-1">I've Installed It</Button>
          </div>
        </div>
      </Modal>

      {/* Permission Modal */}
      <Modal isOpen={showPermissionModal} onClose={() => setShowPermissionModal(false)} title="">
        <div className="space-y-5">
          {/* Header with icon */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3" style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
            }}>
              <span className="text-3xl">🔒</span>
            </div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Allow Activity Tracking?</h2>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              WorkStack needs your permission to track your browsing
            </p>
          </div>

          {/* What we track */}
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}>
                <span style={{ color: '#22c55e' }}>✓</span>
              </div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>What we'll do</span>
            </div>
            <ul className="space-y-2 text-sm ml-10" style={{ color: 'var(--text-secondary)' }}>
              <li className="flex items-start gap-2">
                <span style={{ color: '#22c55e' }}>•</span>
                <span>Track which tabs you visit and for how long</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: '#22c55e' }}>•</span>
                <span>Help you understand your browsing habits</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: '#22c55e' }}>•</span>
                <span>All data is stored privately in your account</span>
              </li>
            </ul>
          </div>

          {/* Warning */}
          <div className="p-4 rounded-xl flex gap-3" style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>
            <div className="flex-shrink-0">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: '#ea580c' }}>Your activity will be tracked</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                The extension will track ALL websites you visit while tracking is enabled. You can stop tracking at any time.
              </p>
            </div>
          </div>

          {/* Data info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-lg">✅</span>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>We Collect</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>URL, title, domain, time</p>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-lg">🛡️</span>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>We DON'T Collect</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Passwords, forms, personal info</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowPermissionModal(false)}
              className="flex-1 px-4 py-3 rounded-lg font-medium transition-all active:scale-95"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmStartTracking}
              className="flex-1 px-4 py-3 rounded-lg font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', color: 'white', cursor: 'pointer' }}
            >
              <span>Allow Tracking</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Previous Activity Modal */}
      <Modal isOpen={showPreviousActivityModal} onClose={() => setShowPreviousActivityModal(false)} title="Previous Activity">
        <div className="space-y-4">
          {loadingPreviousActivity ? (
            <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              <div className="inline-block w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mb-2"></div>
              <p>Loading previous activity...</p>
            </div>
          ) : previousActivityData.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              <p className="text-4xl mb-2">📊</p>
              <p>No previous activity found</p>
              <p className="text-sm mt-1">Track some activity to see your history here</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto pr-2" style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(139, 92, 246, 0.3) transparent'
            }}>
              {/* Group by date */}
              {(() => {
                const groupedByDate: Record<string, typeof previousActivityData> = {}
                previousActivityData.forEach(item => {
                  const date = new Date(item.started_at).toLocaleDateString()
                  if (!groupedByDate[date]) groupedByDate[date] = []
                  groupedByDate[date].push(item)
                })
                return Object.entries(groupedByDate).map(([date, items]) => (
                  <div key={date} className="mb-4">
                    <h3 className="text-sm font-semibold mb-2 px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                      {date}
                    </h3>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <a
                          key={item.id}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 rounded-lg border transition-all duration-75 hover:scale-[1.01] active:scale-100 hover:shadow-md"
                          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', cursor: 'pointer' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {item.title || item.url}
                              </p>
                              <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                                {item.domain}
                              </p>
                            </div>
                            <div className="text-right ml-3 flex-shrink-0">
                              <p className="text-sm font-medium" style={{ color: '#8b5cf6' }}>
                                {Math.floor(item.duration_seconds / 60)}m
                              </p>
                              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {new Date(item.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  )
}
