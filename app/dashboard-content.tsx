'use client'

import { useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getExtensionId, isExtensionInstalledViaContentScript, requestExtensionIdFromContentScript, isExtensionInstalled, checkExtensionLocal } from '@/lib/extension-detect'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { BookmarkMenu } from '@/components/bookmark-menu'
import type { Bookmark, Collection } from '@/lib/types'
import {
  guestStoreGet,
  guestStoreSet,
  GUEST_KEYS,
  markGuestMode
} from '@/lib/guest-storage'
import { generateUUID } from '@/lib/utils'

// Lazy load heavy chart component for faster initial load
const ChartWithToggle = lazy(() => import('@/components/dashboard/charts').then(m => ({ default: m.ChartWithToggle })))

// Time-based greeting for personal touch
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Safely extract hostname from URL
function safeGetHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function DashboardContent({ initialBookmarks, initialCollections, initialStats }: { initialBookmarks: Bookmark[]; initialCollections: Collection[]; initialStats: { totalBookmarks: number; favoritesCount: number; unreadCount: number } }) {
  const greeting = getGreeting()
  const router = useRouter()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks)
  const [collections, setCollections] = useState<Collection[]>(initialCollections)
  // Combined counts state for atomic updates - initialized from server-side data
  const [counts, setCounts] = useState(initialStats)
  const [isGuest, setIsGuest] = useState(false)
  const [loading, setLoading] = useState(false) // Start with loading=false for instant render
  const [isTracking, setIsTracking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [hasSavedSession, setHasSavedSession] = useState(false)
  const [hasServerActivity, setHasServerActivity] = useState(false)
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
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const initTimerRef = useRef<NodeJS.Timeout | null>(null)
  const statusCheckTimerRef = useRef<NodeJS.Timeout | null>(null)
  const tokenSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const extensionCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const stopTrackingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Check if browser is Chromium-based AND not mobile (supports Chrome extensions)
  // Use state to avoid hydration mismatch - initialized to false for SSR consistency
  const [isChromium, setIsChromium] = useState(false)

  // Check if browser is Chromium-based after mount (client-only)
  useEffect(() => {
    const checkChromium = () => {
      const userAgent = navigator.userAgent

      // Check if mobile device (iOS or Android)
      const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      if (isMobile) {
        setIsChromium(false)
        return
      }

      // Check for Safari (non-Chromium)
      const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent)
      if (isSafari) {
        setIsChromium(false)
        return
      }

      // Check for Chrome, Chromium, Brave, Edge (Chromium), Opera, Vivaldi, etc.
      // Exclude old Edge (EdgeHTML) which has "Edge/" not "Edg/"
      const result = /Chrome|Chromium|Brave|Edg|OPR|Vivaldi/.test(userAgent) && !/Edge\/|EdgeHTML|MSIE|Trident/.test(userAgent)
      setIsChromium(result)
    }

    checkChromium()
  }, [])

  // Fetch fresh data from server
  const fetchFreshData = async () => {
    try {
      // Get user token for API call
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        // Guest mode - load from localStorage
        markGuestMode()
        try {
          const storedBookmarks = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
          const storedCollections = guestStoreGet<Collection[]>(GUEST_KEYS.COLLECTIONS)
          if (storedBookmarks) {
            setBookmarks(storedBookmarks.slice(0, 5))
            setCounts({
              totalBookmarks: storedBookmarks.length,
              favoritesCount: storedBookmarks.filter((b: Bookmark) => b.is_favorite).length,
              unreadCount: storedBookmarks.filter((b: Bookmark) => !b.is_read).length,
            })
          }
          if (storedCollections) {
            setCollections(storedCollections)
          } else {
            // Create default collection for guest
            const defaultCollection: Collection = {
              id: generateUUID(),
              user_id: '',
              name: 'My Collection (default)',
              description: 'Your first collection',
              is_public: false,
              share_slug: 'my-collection-' + generateUUID().substring(0, 8),
              share_code: Math.random().toString(36).substring(2, 10),
              created_at: new Date().toISOString()
            }
            guestStoreSet(GUEST_KEYS.COLLECTIONS, [defaultCollection])
            setCollections([defaultCollection])
          }
        } catch {
          // Error loading guest data
        }
        return
      }

    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    // Fetch stats from single optimized endpoint
    const statsPromise = fetch('/api/stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }).then(async (res) => {
      if (!res.ok) {
        console.warn('Stats API returned non-OK status:', res.status)
        return { total_bookmarks: 0, favorites_count: 0, unread_count: 0 }
      }
      return res.json()
    }).catch((err) => {
      console.warn('Failed to fetch stats:', err)
      return { total_bookmarks: 0, favorites_count: 0, unread_count: 0 }
    })

    // Fetch other data in parallel
    const [recentBookmarksRes, collectionsRes, statsData] = await Promise.all([
      supabase.from('bookmarks').select('*').eq('user_id', user.id).limit(5).order('created_at', { ascending: false }),
      supabase.from('collections').select('*').eq('user_id', user.id),
      statsPromise,
    ])

    // Update counts atomically from single response
    setCounts({
      totalBookmarks: statsData.total_bookmarks ?? 0,
      favoritesCount: statsData.favorites_count ?? 0,
      unreadCount: statsData.unread_count ?? 0,
    })

    if (recentBookmarksRes.data) setBookmarks(recentBookmarksRes.data)

    // Handle collections - create default collection if none exist
    let collectionsData = collectionsRes.data || []
    if (collectionsData.length === 0) {
      // Create default collection
      const { data: newCollection } = await supabase
        .from('collections')
        .insert({
          name: 'My Collection (default)',
          description: 'Your first collection',
          is_public: false,
          share_slug: `my-collection-${generateUUID().substring(0, 8)}`,
          share_code: Math.random().toString(36).substring(2, 10),
          user_id: user.id,
        })
        .select()
        .single()

      if (newCollection) {
        collectionsData = [newCollection]
      }
    }
    setCollections(collectionsData)
    } catch (error) {
      console.warn('Error fetching fresh data:', error)
    }
  }

  // Check extension on mount (deferred to not block initial render)
  useEffect(() => {

    // Use a ref to store the handler for stable reference across HMR
    const handlerRef = { current: null as EventListener | null }

    handlerRef.current = (event: Event) => {
      const customEvent = event as CustomEvent<{ installed: boolean; extensionId?: string }>
      if (customEvent.detail?.installed) {
        setExtensionInstalled(true)
        if (customEvent.detail?.extensionId) {
          // Clear any existing interval before starting a new one
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current)
          }
          checkExtensionStatus()
          checkIntervalRef.current = setInterval(checkExtensionStatus, 2000)
        }
      }
    }

    const handleExtensionLoaded = handlerRef.current
    window.addEventListener('workstack-extension-loaded', handleExtensionLoaded)

    // Defer extension detection to not block initial render
    initTimerRef.current = setTimeout(async () => {
      // Also check immediately (in case content script already ran)
      if (isExtensionInstalledViaContentScript()) {
        setExtensionInstalled(true)
        const extensionId = getExtensionId()
        if (extensionId) {
          // Delay status check slightly
          statusCheckTimerRef.current = setTimeout(() => {
            // Clear any existing interval before starting a new one
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current)
            }
            checkExtensionStatus()
            checkIntervalRef.current = setInterval(checkExtensionStatus, 2000)
          }, 100)
        }
      }

      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setIsGuest(true)
      }

      // Check if there's tracked activity on the server
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        try {
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
            if (result.success && result.data && result.data.length > 0) {
              setHasServerActivity(true)
            }
          }
        } catch {
          // Silently ignore error
        }
      }

      // Hide loading state immediately - data will load in background
      setLoading(false)

      // Check extension status regardless of login state
      checkExtensionLocal()

      // Only store token and set up subscription if logged in
      if (user) {
        // Store auth token in extension on page load
        storeAuthTokenInExtension()

        // Set up realtime subscription for instant updates
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
              fetchFreshData()
            }
          )
          .subscribe((status: string) => {
            // Reconnect if channel errors out (e.g. after idle/network change)
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setTimeout(() => {
                channel.subscribe()
              }, 3000)
            }
          })

        channelRef.current = channel
      }

      // Fetch fresh data in background (non-blocking)
      fetchFreshData()
    }, 50) // Small delay to avoid hydration issues

    // Listen for auth state changes and sync token to extension
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: { access_token?: string } | null) => {
      if (event === 'SIGNED_IN') {
        setIsGuest(false)
        fetchFreshData()
      } else if (event === 'SIGNED_OUT') {
        setIsGuest(true)
        setBookmarks([])
        setCollections([])
        setCounts({ totalBookmarks: 0, favoritesCount: 0, unreadCount: 0 })
        setHasSavedSession(false)
        setHasServerActivity(false)
        // Notify extension to clear userId and saved session
        const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: () => void) => void; lastError?: { message?: string } } } }).chrome
        if (chrome?.runtime) {
          const extensionId = getExtensionId()
          if (extensionId) {
            chrome.runtime.sendMessage?.(extensionId, { action: 'clearUserData' })
          }
        }
      }
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Use the session from the event directly
        if (session?.access_token) {
          storeAuthTokenToExtension(session.access_token)
        }
      }
    })

    // Re-check extension status and refresh data when tab becomes visible again
    // (browser throttles setInterval to ~1/min for background tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExtensionStatus()
        fetchFreshData()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      // Clear all timeouts
      if (initTimerRef.current) clearTimeout(initTimerRef.current)
      if (statusCheckTimerRef.current) clearTimeout(statusCheckTimerRef.current)
      if (tokenSyncTimeoutRef.current) clearTimeout(tokenSyncTimeoutRef.current)
      if (extensionCheckTimeoutRef.current) clearTimeout(extensionCheckTimeoutRef.current)
      // Capture ref value locally to avoid stale closure
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const stopTrackingTimeout = stopTrackingTimeoutRef.current
      if (stopTrackingTimeout) clearTimeout(stopTrackingTimeout)

      // Clear interval
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }

      // Remove event listeners
      if (handlerRef.current) {
        window.removeEventListener('workstack-extension-loaded', handlerRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      // Unsubscribe from auth changes
      subscription.unsubscribe()

      // Remove Supabase channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }

    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Store auth token in extension
  const storeAuthTokenToExtension = (token: string) => {
    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, message: Record<string, unknown>, callback?: (r: unknown) => void) => void; lastError?: { message?: string } } } }).chrome
    if (!chrome?.runtime) return

    const extensionId = getExtensionId()
    if (!extensionId) return

    let responded = false
    tokenSyncTimeoutRef.current = setTimeout(() => {
      if (!responded) {
        responded = true
      }
    }, 500)

    chrome.runtime?.sendMessage?.(extensionId, {
      action: 'storeAuthToken',
      authToken: token,
      apiBaseUrl: window.location.origin
    }, () => {
      if (responded) return
      responded = true
      if (tokenSyncTimeoutRef.current) clearTimeout(tokenSyncTimeoutRef.current)
    })
  }

  const storeAuthTokenInExtension = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      storeAuthTokenToExtension(session.access_token)
    }
  }

  const checkExtensionInitial = async () => {
    if (typeof window === 'undefined') {
      setExtensionInstalled(false)
      return
    }

    // First check: Content script marker (most reliable - set by content.js injected into page world)
    if (isExtensionInstalledViaContentScript()) {
      setExtensionInstalled(true)
      const extensionId = getExtensionId()
      if (extensionId) {
        // Clear any existing interval before starting a new one
        if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
        checkExtensionStatus()
        checkIntervalRef.current = setInterval(checkExtensionStatus, 2000)
      }
      return
    }

    // Second check: Actively request extension ID from content script via postMessage.
    // The content script may have announced before our listener was ready (race condition),
    // so we explicitly ask and wait for a response.
    const extensionIdFromCS: string | null = await requestExtensionIdFromContentScript(3000)
    if (extensionIdFromCS) {
      setExtensionInstalled(true)
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
      checkExtensionStatus()
      checkIntervalRef.current = setInterval(checkExtensionStatus, 2000)
      return
    }

    // Third check: Try messaging via chrome.runtime API
    const chromeWindow = window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: (r: { success?: boolean; isTracking?: boolean; isPaused?: boolean } | undefined) => void) => void; lastError?: { message?: string } } } }
    if (!chromeWindow.chrome?.runtime) {
      setExtensionInstalled(false)
      return
    }

    const chrome = chromeWindow.chrome

    // Try to get extension ID - this now uses known IDs as fallback
    const extensionId = getExtensionId()

    // If we don't have an extension ID at this point, we can't send a message
    if (!extensionId) {
      setExtensionInstalled(false)
      return
    }

    // Verify the extension actually responds
    let responded = false
    extensionCheckTimeoutRef.current = setTimeout(() => {
      if (!responded) {
        responded = true
        setExtensionInstalled(false)
      }
    }, 1000)

    chrome.runtime?.sendMessage?.(extensionId, { action: 'ping' }, (response: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean } | undefined) => {
      if (responded) return
      responded = true
      if (extensionCheckTimeoutRef.current) clearTimeout(extensionCheckTimeoutRef.current)

      if (chrome.runtime?.lastError) {
        setExtensionInstalled(false)
      } else if (response?.success) {
        setExtensionInstalled(true)
        // Clear any existing interval before starting a new one
        if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
        checkExtensionStatus()
        checkIntervalRef.current = setInterval(checkExtensionStatus, 2000)
      } else {
        setExtensionInstalled(false)
      }
    })
  }

  const checkExtensionStatus = () => {
    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: (r: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; sessionTabs?: unknown[] } | undefined) => void) => void; lastError?: { message?: string } } } }).chrome
    if (!chrome?.runtime) return

    const extensionId = getExtensionId()
    if (!extensionId) return

    chrome.runtime?.sendMessage?.(extensionId, { action: 'getStatus' }, (response: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; hasSavedSession?: boolean; sessionTabs?: unknown[] } | undefined) => {
      if (response && !chrome.runtime?.lastError) {
        if (response.isTracking !== undefined) setIsTracking(response.isTracking)
        setIsPaused(response.isPaused || false)
        const savedSession = response.hasSavedSession || response.savedSession || false
        setHasSavedSession(savedSession)
        if (response.sessionTabs) {
          setSessionTabs(response.sessionTabs as Array<{
            url: string
            title: string
            domain: string
            duration_seconds: number
          }>)
        }
      }
    })
  }

  const startTracking = async () => {
    if (isGuest) {
      router.push('/login')
      return
    }

    // Re-check extension status when user clicks Track Activity
    const recheckResult: boolean = await checkExtensionLocal()
    if (recheckResult) {
      // Extension is now detected - proceed with tracking
      setShowPermissionModal(true)
      return
    }

    // Extension still not detected - show modal
    if (extensionInstalled === false) {
      setShowExtensionModal(true)
      return
    }

    // Extension might be in false state even though it's installed
    // Try one more check before showing modal
    const finalCheck: boolean = await checkExtensionLocal()
    if (finalCheck) {
      // Extension detected after re-check - proceed
      setShowPermissionModal(true)
      return
    }

    // Still not detected - show modal
    setShowExtensionModal(true)
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
    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: (r: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; sessionTabs?: unknown[] } | undefined) => void) => void; lastError?: { message?: string } } } }).chrome

    const extensionId = getExtensionId()
    if (!extensionId) {
      setShowExtensionModal(true)
      return
    }

    // First store the auth token, then start tracking
    if (session?.access_token) {
      storeAuthTokenToExtension(session.access_token)
    }

    if (!chrome?.runtime) return

    chrome.runtime?.sendMessage?.(extensionId, {
      action: 'startTracking',
      userId: user.id,
      authToken: session?.access_token,
      apiBaseUrl
    }, (response: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean } | undefined) => {
      if (response?.success) {
        setIsTracking(true)
        setIsPaused(false)
      }
    })
  }

  const stopTracking = () => {
    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: (r: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; sessionTabs?: unknown[] } | undefined) => void) => void; lastError?: { message?: string } } } }).chrome
    if (!chrome?.runtime) return

    const extensionId = getExtensionId()
    if (!extensionId) return

    chrome.runtime?.sendMessage?.(extensionId, { action: 'stopTracking' }, (response: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; hasSavedSession?: boolean } | undefined) => {
      if (response?.success) {
        setIsTracking(false)
        setIsPaused(false)
        setSessionTabs([])
        // Set hasSavedSession from response if available
        if (response.hasSavedSession !== undefined) {
          setHasSavedSession(response.hasSavedSession)
        }
      }
    })
  }

  const resumeActivity = () => {
    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: (r: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; sessionTabs?: unknown[] } | undefined) => void) => void; lastError?: { message?: string } } } }).chrome
    if (!chrome?.runtime) return

    const extensionId = getExtensionId()
    if (!extensionId) return

    chrome.runtime?.sendMessage?.(extensionId, { action: 'openSavedTabs' }, (response: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean } | undefined) => {
      if (response?.success) {
        // Tabs opened but tracking not started
      }
    })
  }

  const showPreviousActivity = async () => {
    setShowPreviousActivityModal(true)
    setLoadingPreviousActivity(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get the latest tracking session for this user
      const { data: sessionData } = await supabase
        .from('tab_activity')
        .select('tracking_session_id')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)

      if (!sessionData || sessionData.length === 0) {
        setPreviousActivityData([])
        setLoadingPreviousActivity(false)
        return
      }

      const latestSessionId = sessionData[0].tracking_session_id

      // Fetch only entries from the latest session
      const { data } = await supabase
        .from('tab_activity')
        .select('*')
        .eq('user_id', user.id)
        .eq('tracking_session_id', latestSessionId)
        .order('ended_at', { ascending: false })

      if (data) {
        setPreviousActivityData(data)
      }
    } catch {
      // Error fetching previous activity
    } finally {
      setLoadingPreviousActivity(false)
    }
  }

  const pauseTracking = () => {
    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: (r: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; sessionTabs?: unknown[] } | undefined) => void) => void; lastError?: { message?: string } } } }).chrome
    if (!chrome?.runtime) return

    const extensionId = getExtensionId()
    if (!extensionId) return

    chrome.runtime?.sendMessage?.(extensionId, { action: 'pauseTracking' }, (response: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean } | undefined) => {
      if (response?.success) {
        setIsPaused(true)
      }
    })
  }

  const resumeTracking = () => {
    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb?: (r: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean; sessionTabs?: unknown[] } | undefined) => void) => void; lastError?: { message?: string } } } }).chrome
    if (!chrome?.runtime) return

    const extensionId = getExtensionId()
    if (!extensionId) return

    chrome.runtime?.sendMessage?.(extensionId, { action: 'resumeTracking' }, (response: { success?: boolean; isTracking?: boolean; isPaused?: boolean; savedSession?: boolean } | undefined) => {
      if (response?.success) {
        setIsPaused(false)
      }
    })
  }

  // Bookmark action functions
  const toggleFavorite = async (bookmark: Bookmark) => {
    if (isGuest) {
      const updated = bookmarks.map(b => b.id === bookmark.id ? { ...b, is_favorite: !b.is_favorite } : b)
      setBookmarks(updated)
      // Save to localStorage
      try {
        const stored = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
        if (stored) {
          const updatedAll = stored.map((b: Bookmark) => b.id === bookmark.id ? { ...b, is_favorite: !b.is_favorite } : b)
          guestStoreSet(GUEST_KEYS.BOOKMARKS, updatedAll)
        }
      } catch {
        // Error saving to localStorage
      }
      fetchFreshData()
      return
    }
    await supabase.from('bookmarks').update({ is_favorite: !bookmark.is_favorite }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_favorite: !b.is_favorite } : b))
    fetchFreshData()
  }

  const toggleRead = async (bookmark: Bookmark) => {
    if (isGuest) {
      const updated = bookmarks.map(b => b.id === bookmark.id ? { ...b, is_read: !b.is_read } : b)
      setBookmarks(updated)
      // Save to localStorage
      try {
        const stored = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
        if (stored) {
          const updatedAll = stored.map((b: Bookmark) => b.id === bookmark.id ? { ...b, is_read: !b.is_read } : b)
          guestStoreSet(GUEST_KEYS.BOOKMARKS, updatedAll)
        }
      } catch {
        // Error saving to localStorage
      }
      fetchFreshData()
      return
    }
    await supabase.from('bookmarks').update({ is_read: !bookmark.is_read }).eq('id', bookmark.id)
    setBookmarks(bookmarks.map(b => b.id === bookmark.id ? { ...b, is_read: !b.is_read } : b))
    fetchFreshData()
  }

  const deleteBookmark = async (id: string) => {
    if (isGuest) {
      setBookmarks(bookmarks.filter(b => b.id !== id))
      // Save to localStorage
      try {
        const stored = guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS)
        if (stored) {
          const updatedAll = stored.filter((b: Bookmark) => b.id !== id)
          guestStoreSet(GUEST_KEYS.BOOKMARKS, updatedAll)
        }
      } catch {
        // Error saving to localStorage
      }
      fetchFreshData()
      return
    }
    await supabase.from('bookmarks').delete().eq('id', id)
    setBookmarks(bookmarks.filter(b => b.id !== id))
    fetchFreshData()
  }

  const stats = useMemo(() => ({
    total: counts.totalBookmarks,
    unread: counts.unreadCount,
    favorites: counts.favoritesCount,
    collections: collections.length,
  }), [counts.totalBookmarks, counts.unreadCount, counts.favoritesCount, collections.length])

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

  // Helper to generate better display titles
  const getDisplayTitle = (url: string, title: string) => {
    // If title is just the domain, try to generate something better
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-8 pt-20">
          <div className="h-12 bg-gray-200 rounded w-64 animate-pulse mb-2" />
          <div className="h-6 bg-gray-200 rounded w-48 animate-pulse mb-8" />
          <div className="flex gap-3">
            <div className="h-10 bg-gray-200 rounded-lg w-40 animate-pulse" />
            <div className="h-10 bg-gray-200 rounded-lg w-48 animate-pulse" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8">
        {/* Welcome Section - Mobile Optimized */}
        <div className="text-center md:text-left md:flex md:justify-between md:items-start md:gap-6">
          <div className="md:pt-20">
            <h1 className="text-3xl md:text-5xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {greeting}
            </h1>
            <p className="mt-2 text-lg md:text-xl" style={{ color: 'var(--text-secondary)' }}>
              Your personal bookmark manager
            </p>
            {isGuest && (
              <p className="mt-3">
                <span className="text-xs md:text-sm px-3 py-1.5 rounded-full inline-block" style={{ backgroundColor: 'rgba(251, 146, 60, 0.2)', color: '#ea580c' }}>
                  ⚠️ Guest Mode - <a href="/login" className="underline hover:no-underline font-medium">Sign in</a> to save your data
                </span>
              </p>
            )}
          </div>
          <div className="mt-4 md:mt-24 flex justify-center md:justify-end">
            <Suspense fallback={<div className="w-full h-48 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />}>
              <ChartWithToggle
              data={[
                { label: 'Bookmarks', value: stats.total, color: 'var(--color-sky)' },
                { label: 'To Read', value: stats.unread, color: 'var(--color-amber)' },
                { label: 'Favorites', value: stats.favorites, color: 'var(--color-orange)' },
                { label: 'Collections', value: stats.collections, color: 'var(--color-purple)' },
              ]}
            />
            </Suspense>
          </div>
        </div>

        {/* Track Activity Section - Mobile Optimized */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {!isTracking ? (
              <>
                <button
                  onClick={startTracking}
                  className="w-full sm:w-auto px-3 py-2.5 rounded-lg font-medium transition-all duration-75 active:scale-95 hover:scale-[1.02] flex items-center justify-center gap-2 text-sm"
                  style={{ backgroundColor: '#22c55e', color: 'white', cursor: 'pointer' }}
                >
                  <span>🎯 Track Activity</span>
                </button>
                {!isGuest && (hasSavedSession || hasServerActivity) && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {hasSavedSession && (
                      <button
                        onClick={resumeActivity}
                        className="w-full sm:w-auto px-3 py-2.5 rounded-lg font-medium transition-all duration-75 active:scale-95 hover:scale-[1.02] flex items-center justify-center gap-2 text-sm"
                        style={{ backgroundColor: '#3b82f6', color: 'white', cursor: 'pointer' }}
                      >
                        <span>📂 Resume Activity</span>
                      </button>
                    )}
                    <button
                      onClick={showPreviousActivity}
                      className="w-full sm:w-auto px-3 py-2.5 rounded-lg font-medium transition-all duration-75 active:scale-95 hover:scale-[1.02] flex items-center justify-center gap-2 text-sm"
                      style={{ backgroundColor: '#8b5cf6', color: 'white', cursor: 'pointer' }}
                    >
                      <span>📊 View History</span>
                    </button>
                  </div>
                )}
                {/* Extension status when not tracking */}
                {extensionInstalled === true ? (
                  <span className="text-sm font-semibold flex items-center gap-1 px-3 py-2 rounded-lg" style={{ color: '#22c55e' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ strokeWidth: 2.5 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="hidden sm:inline">Extension ready</span>
                    <span className="sm:hidden">Ready</span>
                  </span>
                ) : isChromium ? (
                  <button
                    onClick={() => router.push('/extension')}
                    className="w-full sm:w-auto px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: 'var(--color-purple)',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="hidden sm:inline">Download Extension</span>
                    <span className="sm:hidden">Get Extension</span>
                  </button>
                ) : (
                  <span className="text-xs sm:text-sm font-medium flex items-center gap-2 px-3 py-2 rounded-lg" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="hidden sm:inline">Extension not supported</span>
                    <span className="sm:hidden">Not supported</span>
                  </span>
                )}
              </>
            ) : (
              <div className="flex flex-row gap-2 w-full sm:w-auto">
                <button
                  onClick={isPaused ? resumeTracking : pauseTracking}
                  className="flex-1 sm:w-auto px-3 py-2.5 rounded-lg font-medium transition-all duration-75 active:scale-95 hover:scale-[1.02] flex items-center justify-center gap-2 text-sm"
                  style={{ backgroundColor: isPaused ? '#22c55e' : '#f59e0b', color: 'white', cursor: 'pointer' }}
                >
                  {isPaused ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                      <span>Resume</span>
                    </>
                  ) : (
                    <span>Pause</span>
                  )}
                </button>
                <button
                  onClick={stopTracking}
                  className="flex-1 sm:w-auto px-3 py-2.5 rounded-lg font-medium transition-all duration-75 active:scale-95 hover:scale-[1.02]"
                  style={{ backgroundColor: '#ef4444', color: 'white', cursor: 'pointer' }}
                >
                  Stop
                </button>
                {isTracking && (
                  <button
                    onClick={() => router.push('/tracked-activity')}
                    className="flex-1 sm:w-auto px-3 py-2.5 rounded-lg text-sm transition-all duration-75 active:scale-95"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                  >
                    View
                  </button>
                )}
              </div>
            )}

            {isTracking && !isPaused && (
              <span className="text-xs sm:text-sm px-3 py-2 rounded-lg flex items-center gap-2" style={{ color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Recording
              </span>
            )}
            {isTracking && isPaused && (
              <span className="text-xs sm:text-sm px-3 py-2 rounded-lg flex items-center gap-2" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Paused
              </span>
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
                    key={`${tab.url}-${index}-${tab.duration_seconds}`}
                    className="p-3 border-b hover:bg-gray-50 transition-colors duration-150"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(tab.url)}&sz=32`}
                        className="w-5 h-5 rounded mt-0.5 flex-shrink-0"
                        alt="Favicon"
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

        {/* Stats - Mobile Optimized */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 md:p-6 text-center">
              <p className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--color-sky)' }}>{stats.total}</p>
              <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Bookmarks</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 md:p-6 text-center">
              <p className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--color-amber)' }}>{stats.unread}</p>
              <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>To Read</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 md:p-6 text-center">
              <p className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--color-orange)' }}>{stats.favorites}</p>
              <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Favorites</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 md:p-6 text-center">
              <p className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--color-purple)' }}>{stats.collections}</p>
              <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Collections</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - Mobile Optimized */}
        <div>
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4" style={{ color: 'var(--text-primary)' }}>Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => router.push('/bookmarks')}
              className="p-4 md:p-6 rounded-lg text-left hover:shadow-md transition-all duration-75 hover:scale-105 active:scale-95 flex flex-row md:flex-col items-center md:items-start gap-3 md:gap-0"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', cursor: 'pointer' }}
            >
              <span className="text-2xl md:text-3xl">🔖</span>
              <div className="text-left">
                <h3 className="font-semibold text-sm md:text-base" style={{ color: 'var(--text-primary)' }}>Add Bookmark</h3>
                <p className="text-xs md:text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>Save a new link</p>
              </div>
            </button>
            <button
              onClick={() => router.push('/reading-list')}
              className="p-4 md:p-6 rounded-lg text-left hover:shadow-md transition-all duration-75 hover:scale-105 active:scale-95 flex flex-row md:flex-col items-center md:items-start gap-3 md:gap-0"
              style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', cursor: 'pointer' }}
            >
              <span className="text-2xl md:text-3xl">📚</span>
              <div className="text-left">
                <h3 className="font-semibold text-sm md:text-base" style={{ color: 'var(--text-primary)' }}>Reading List</h3>
                <p className="text-xs md:text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>{stats.unread} unread items</p>
              </div>
            </button>
            <button
              onClick={() => router.push('/collections')}
              className="p-4 md:p-6 rounded-lg text-left hover:shadow-md transition-all duration-75 hover:scale-105 active:scale-95 flex flex-row md:flex-col items-center md:items-start gap-3 md:gap-0"
              style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', cursor: 'pointer' }}
            >
              <span className="text-2xl md:text-3xl">📦</span>
              <div className="text-left">
                <h3 className="font-semibold text-sm md:text-base" style={{ color: 'var(--text-primary)' }}>Collections</h3>
                <p className="text-xs md:text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>Organize & share</p>
              </div>
            </button>
          </div>
        </div>

        {/* Recent Bookmarks */}
        <div>
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4" style={{ color: 'var(--text-primary)' }}>Recent Bookmarks</h2>
          {bookmarks.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="text-5xl mb-4">🔖</div>
                <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>No bookmarks yet</p>
                <p style={{ color: 'var(--text-secondary)' }}>Your digital garden awaits — start saving your favorite links!</p>
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${safeGetHostname(bookmark.url)}&sz=32`}
                          className="w-8 h-8 rounded flex-shrink-0"
                          alt="Favicon"
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
              <li>Enable &quot;Developer mode&quot; (top right toggle)</li>
              <li>Click &quot;Load unpacked&quot; button</li>
              <li>Select the <code className="bg-gray-200 px-1 rounded">workstack-extension</code> folder</li>
              <li>Come back and click &quot;Track Activity&quot; again</li>
            </ol>
          </div>
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <p className="text-sm" style={{ color: '#1e40af' }}>
              <strong>Note:</strong> Make sure you've installed the WorkStack extension in your browser before starting tracking.
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setShowExtensionModal(false)} className="flex-1">Got it</Button>
            <Button variant="secondary" onClick={() => {
              setShowExtensionModal(false)
              checkExtensionLocal()
            }} className="flex-1">I&apos;ve Installed It</Button>
          </div>
        </div>
      </Modal>

      {/* Permission Modal */}
      <Modal isOpen={showPermissionModal} onClose={() => setShowPermissionModal(false)} title="" size="md"
        footer={
          <>
            <button
              onClick={() => setShowPermissionModal(false)}
              className="flex-1 px-5 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 hover:scale-105"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmStartTracking}
              className="flex-1 px-5 py-3 rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--color-primary)', color: 'white', cursor: 'pointer' }}
            >
              <span>Allow Tracking</span>
              <span className="text-lg">→</span>
            </button>
          </>
        }
      >
        <div className="flex flex-col h-full justify-between gap-4">
          {/* Header with icon */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-2" style={{
              backgroundColor: 'rgba(13, 148, 136, 0.15)',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.2)'
            }}>
              <span className="text-3xl">🔒</span>
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Allow Activity Tracking?</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              WorkStack needs permission to track your browsing activity
            </p>
          </div>

          {/* What we track */}
          <div className="p-3 rounded-xl" style={{ backgroundColor: 'rgba(101, 163, 13, 0.1)', border: '1px solid rgba(101, 163, 13, 0.2)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: 'rgba(101, 163, 13, 0.2)' }}>
                <span style={{ color: 'var(--color-olive)' }}>✓</span>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>What we&apos;ll do</span>
            </div>
            <ul className="space-y-1 text-xs ml-8" style={{ color: 'var(--text-secondary)' }}>
              <li>• Track tabs you visit and time spent</li>
              <li>• Help understand your browsing habits</li>
              <li>• All data stored privately in your account</li>
            </ul>
          </div>

          {/* Warning */}
          <div className="p-3 rounded-xl flex gap-2" style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-xs font-semibold" style={{ color: '#ea580c' }}>Your activity will be tracked</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                The extension will track ALL websites you visit while tracking is enabled. You can stop tracking at any time.
              </p>
            </div>
          </div>

          {/* Data info */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-xl text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-lg">✅</span>
              <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>We Collect</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>URL, title, domain, time</p>
            </div>
            <div className="p-2 rounded-xl text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-lg">🛡️</span>
              <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>We DON&apos;T Collect</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Passwords, forms, personal info</p>
            </div>
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
              {/* Group by full URL (each unique page/video shows separately) */}
              {(() => {
                const groupedByUrl = new Map<string, {
                  domain: string
                  url: string
                  title: string
                  totalSeconds: number
                  visitCount: number
                  lastVisited: string
                }>()

                previousActivityData.forEach(item => {
                  const urlKey = item.url

                  if (!groupedByUrl.has(urlKey)) {
                    groupedByUrl.set(urlKey, {
                      domain: item.domain,
                      url: item.url,
                      title: item.title || item.url,
                      totalSeconds: item.duration_seconds || 0,
                      visitCount: 1,
                      lastVisited: item.started_at
                    })
                  } else {
                    const existing = groupedByUrl.get(urlKey)!
                    existing.totalSeconds += item.duration_seconds || 0
                    existing.visitCount += 1
                    if (item.started_at > existing.lastVisited) {
                      existing.lastVisited = item.started_at
                      existing.title = item.title || item.url
                    }
                  }
                })

                // Sort by total time spent
                const sorted = Array.from(groupedByUrl.values()).sort((a, b) => b.totalSeconds - a.totalSeconds)

                return sorted.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg border transition-all duration-75 hover:scale-[1.01] active:scale-100 hover:shadow-md mb-2"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', cursor: 'pointer' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`}
                          className="w-6 h-6 rounded flex-shrink-0"
                          alt="Favicon"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {getDisplayTitle(item.url, item.title)}
                            </p>
                            {item.visitCount > 1 && (
                              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                                {item.visitCount} visits
                              </span>
                            )}
                          </div>
                          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                            {item.domain}
                          </p>
                        </div>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className="text-sm font-medium" style={{ color: '#8b5cf6' }}>
                          {item.totalSeconds < 60
                            ? `${item.totalSeconds}s`
                            : item.totalSeconds >= 3600
                            ? `${Math.floor(item.totalSeconds / 3600)}h ${Math.floor((item.totalSeconds % 3600) / 60)}m`
                            : item.totalSeconds % 60 === 0
                            ? `${Math.floor(item.totalSeconds / 60)}m`
                            : `${Math.floor(item.totalSeconds / 60)}m ${item.totalSeconds % 60}s`}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          total time
                        </p>
                      </div>
                    </div>
                  </a>
                ))
              })()}
            </div>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  )
}
