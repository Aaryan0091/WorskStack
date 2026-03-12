// WorkStack Tab Tracker - Background Service Worker
// ONE entry per tab per tracking session - URL/title updates as you navigate

// State
let isTracking = false
let isPaused = false
let isAutomaticMode = true  // Track ALL websites by default
let userId = null
let authToken = null
let apiBaseUrl = null  // Will be set from storage or from website
let hasSavedSession = false
let savedSessionUserId = null  // Track which user owns the saved session
let trackingSessionId = null

// Track the currently active tab
let currentTabId = null
let currentTabStartTime = null

// Track all tabs with their data
// tabId -> { url, title, domain, totalTime, lastSyncTime, dbRecordId }
// totalTime = accumulated time ONLY when this tab was actively being viewed
let tabTimes = new Map()

// API call queue per tab
let apiCallQueue = new Map()

// Periodic sync interval
let syncInterval = null

// Keep-alive interval (prevents service worker termination)
let keepAliveInterval = null

// Process next API call in queue
async function processNextApiCall(tabId) {
  const queue = apiCallQueue.get(tabId)
  if (!queue || queue.length === 0) return

  const operation = queue[0]

  try {
    await operation()
    apiCallQueue.set(tabId, queue.slice(1))
    if (queue.length > 1) {
      processNextApiCall(tabId)
    }
  } catch {
    apiCallQueue.set(tabId, queue.slice(1))
    if (apiCallQueue.get(tabId)?.length > 0) {
      processNextApiCall(tabId)
    }
  }
}

// Add API operation to queue
function queueApiCall(tabId, operation) {
  if (!apiCallQueue.has(tabId)) {
    apiCallQueue.set(tabId, [])
  }
  apiCallQueue.get(tabId).push(operation)
  if (apiCallQueue.get(tabId).length === 1) {
    processNextApiCall(tabId)
  }
}

// Initialize from storage
chrome.storage.local.get(['isTracking', 'isPaused', 'userId', 'authToken', 'apiBaseUrl', 'savedSessionTabs', 'savedSessionUserId'], (result) => {
  if (result.isTracking) isTracking = result.isTracking
  if (result.isPaused) isPaused = result.isPaused
  if (result.userId) userId = result.userId
  if (result.authToken) authToken = result.authToken
  if (result.apiBaseUrl) apiBaseUrl = result.apiBaseUrl
  if (result.savedSessionUserId) savedSessionUserId = result.savedSessionUserId
  // Only set hasSavedSession if saved session belongs to current user
  const savedUserId = result.savedSessionUserId
  const currentUserId = result.userId
  hasSavedSession = result.savedSessionTabs && result.savedSessionTabs.length > 0 &&
    (!savedUserId || savedUserId === currentUserId)

  // Restore tracking session if tracking was active
  if (isTracking && userId && authToken) {
    trackingSessionId = `${userId}_${Date.now()}`
    startKeepAlive()

    // Check extension status on load
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && !isSpecialUrl(tabs[0].url)) {
        makeTabActive(tabs[0])
      }
    })
  }
})

// Helper: Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return url
  }
}

// Helper: Check if URL is a special page
function isSpecialUrl(url) {
  return !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('file://')
}

// Helper: Get active tabs as array
function getActiveTabsArray() {
  const now = Date.now()
  return Array.from(tabTimes.entries()).map(([tabId, tab]) => {
    // Calculate total time including current active time for the active tab
    let totalMs = tab.totalTime
    // If this is the currently active tab, add time from currentTabStartTime
    if (currentTabStartTime && tabId === currentTabId) {
      totalMs += now - currentTabStartTime
    }
    return {
      url: tab.url,
      title: tab.title,
      domain: tab.domain,
      duration_seconds: Math.floor(totalMs / 1000),
      started_at: new Date(now - totalMs).toISOString()
    }
  })
}

// Sync tab data to server - creates or updates ONE entry per tab per session
function syncTabToServer(tabId, isNewEntry = false) {
  if (!authToken || !userId || !trackingSessionId) {
    // Missing credentials, can't sync
    return
  }

  const tabData = tabTimes.get(tabId)
  if (!tabData) {
    // Tab not found in map
    return
  }

  // Capture current time before async operations
  const now = Date.now()

  // Calculate total time: accumulated totalTime + current active time since last sync
  let totalMs = tabData.totalTime

  // Only add current active time if this is the active tab
  // and we haven't synced for this active session yet
  if (tabId === currentTabId && currentTabStartTime) {
    const timeSinceLastSync = now - currentTabStartTime
    totalMs += timeSinceLastSync
  }

  const totalSeconds = Math.floor(totalMs / 1000)

  queueApiCall(tabId, async () => {
    const data = JSON.stringify({
      user_id: userId,
      url: tabData.url,
      title: tabData.title,
      domain: tabData.domain,
      tracking_session_id: trackingSessionId,
      tab_id: String(tabId),
      is_new_entry: isNewEntry,
      elapsed_seconds: totalSeconds
    })

    let response
    try {
      response = await fetch(`${apiBaseUrl}/api/activity/sync-tab`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: data
      })
    } catch {
      // Network error - will retry on next sync interval
      return
    }

    const result = await response.json()

    if (result.success && result.record_id) {
      // Update the tab data in the map (get fresh reference)
      const updatedTab = tabTimes.get(tabId)
      if (updatedTab) {
        updatedTab.dbRecordId = result.record_id
        // Update totalTime to reflect the synced value
        updatedTab.totalTime = totalMs
        // Update lastSyncTime
        updatedTab.lastSyncTime = now
        // Reset currentTabStartTime for the active tab
        if (tabId === currentTabId) {
          currentTabStartTime = now
        }
      }
    }
  })
}

// Keep service worker alive
function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval)

  // Set up alarm for periodic sync (more reliable than setInterval)
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 })

  // Use setInterval as additional keep-alive
  keepAliveInterval = setInterval(() => {
    if (isTracking) {
      // Ping to keep service worker alive
      chrome.storage.local.set({ lastHeartbeat: Date.now() })
    }
  }, 15000) // Every 15 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
  chrome.alarms.clearAll()
}

// Alarm listener for keep-alive sync
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && isTracking && !isPaused && currentTabId) {
    syncTabToServer(currentTabId)
  }
})

// Listen for messages from website
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === 'startTracking') {
    startTracking(request.userId, request.authToken, request.apiBaseUrl, request.isAutomaticMode)
    sendResponse({ success: true })
  } else if (request.action === 'stopTracking') {
    stopTracking(() => {
      // Callback after session is saved
      chrome.storage.local.get(['savedSessionTabs', 'savedSessionUserId', 'userId'], (result) => {
        const savedUserId = result.savedSessionUserId
        const currentUserId = result.userId
        const hasValidSavedSession = result.savedSessionTabs && result.savedSessionTabs.length > 0 &&
          (!savedUserId || savedUserId === currentUserId)
        sendResponse({ success: true, hasSavedSession: hasValidSavedSession })
      })
    })
    return true
  } else if (request.action === 'pauseTracking') {
    pauseTracking()
    sendResponse({ success: true })
  } else if (request.action === 'resumeTracking') {
    resumeTracking()
    sendResponse({ success: true })
  } else if (request.action === 'resumeActivity') {
    resumeActivity()
    sendResponse({ success: true })
  } else if (request.action === 'openSavedTabs') {
    openSavedTabs()
    sendResponse({ success: true })
  } else if (request.action === 'toggleAutomaticMode') {
    toggleAutomaticMode()
    sendResponse({ success: true, isAutomaticMode })
  } else if (request.action === 'setTrackingMode') {
    if (request.isAutomaticMode !== null) {
      isAutomaticMode = request.isAutomaticMode
      chrome.storage.local.set({ isAutomaticMode })
    }
    sendResponse({ success: true, isAutomaticMode })
  } else if (request.action === 'getStatus') {
    const tabs = getActiveTabsArray()
    // Always check storage for hasSavedSession to ensure accurate state
    chrome.storage.local.get(['savedSessionTabs', 'savedSessionUserId', 'userId'], (result) => {
      const savedSessionExists = result.savedSessionTabs && result.savedSessionTabs.length > 0
      const savedUserId = result.savedSessionUserId
      const currentUserId = result.userId
      // Only show hasSavedSession if saved session belongs to current user
      const hasValidSavedSession = savedSessionExists &&
        (!savedUserId || savedUserId === currentUserId)
      hasSavedSession = hasValidSavedSession
      sendResponse({
        isTracking,
        isPaused,
        hasSavedSession: hasValidSavedSession,
        isAutomaticMode,
        sessionTabs: tabs
      })
    })
    return true
  } else if (request.action === 'ping') {
    sendResponse({ success: true, version: '4.3.0' })
  } else if (request.action === 'clearUserData') {
    // Clear user data on logout
    userId = null
    authToken = null
    savedSessionUserId = null
    hasSavedSession = false
    tabTimes.clear()
    currentTabId = null
    currentTabStartTime = null
    chrome.storage.local.set({
      userId: null,
      authToken: null,
      savedSessionUserId: null,
      savedSessionTabs: [],
      savedSessionAt: null,
      isTracking: false,
      isPaused: false
    })
    chrome.action.setBadgeText({ text: '' })
    sendResponse({ success: true })
  } else if (request.action === 'openUrls') {
    openUrls(request.urls)
    sendResponse({ success: true })
  } else if (request.action === 'storeAuthToken') {
    authToken = request.authToken
    apiBaseUrl = request.apiBaseUrl || apiBaseUrl
    // Extract userId from JWT token and store it
    let userIdFromToken = null
    try {
      const payload = JSON.parse(atob(authToken.split('.')[1]))
      userIdFromToken = payload.sub || payload.user_id
    } catch {
      // Failed to parse token, use existing userId from storage
    }
    if (userIdFromToken) {
      userId = userIdFromToken
      chrome.storage.local.set({ authToken, apiBaseUrl, userId })
    } else {
      chrome.storage.local.set({ authToken, apiBaseUrl })
    }
    sendResponse({ success: true })
  } else if (request.action === 'getOpenTabs') {
    chrome.tabs.query({}, (allTabs) => {
      const tabs = allTabs
        .filter(tab => tab.url && !isSpecialUrl(tab.url))
        .map(tab => ({
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          favicon: tab.favIconUrl
        }))
      sendResponse({ tabs })
    })
    return true
  }
  return true
})

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    // Check if saved session belongs to current user
    const savedUserId = savedSessionUserId
    const currentUserId = userId
    const hasValidSavedSession = hasSavedSession &&
      (!savedUserId || savedUserId === currentUserId)
    sendResponse({
      isTracking,
      isPaused,
      hasSavedSession: hasValidSavedSession,
      sessionTabs: getActiveTabsArray()
    })
    return true
  } else if (request.action === 'pauseTracking') {
    pauseTracking()
    sendResponse({ success: true })
  } else if (request.action === 'resumeTracking') {
    resumeTracking()
    sendResponse({ success: true })
  } else if (request.action === 'resumeActivity') {
    resumeActivity()
    sendResponse({ success: true })
  } else if (request.action === 'openSavedTabs') {
    openSavedTabs()
    sendResponse({ success: true })
  } else if (request.action === 'toggleTracking') {
    if (isTracking) {
      stopTracking()
    } else {
      startTracking()
    }
    sendResponse({ success: true, isTracking })
  } else if (request.action === 'storeAuthToken') {
    authToken = request.authToken
    apiBaseUrl = request.apiBaseUrl || apiBaseUrl
    // Extract userId from JWT token and store it
    let userIdFromToken = null
    try {
      const payload = JSON.parse(atob(authToken.split('.')[1]))
      userIdFromToken = payload.sub || payload.user_id
    } catch {
      // Failed to parse token, use existing userId from storage
    }
    if (userIdFromToken) {
      userId = userIdFromToken
      chrome.storage.local.set({ authToken, apiBaseUrl, userId })
    } else {
      chrome.storage.local.set({ authToken, apiBaseUrl })
    }
    sendResponse({ success: true })
  } else if (request.action === 'clearUserData') {
    // Clear user data on logout
    userId = null
    authToken = null
    savedSessionUserId = null
    hasSavedSession = false
    tabTimes.clear()
    currentTabId = null
    currentTabStartTime = null
    chrome.storage.local.set({
      userId: null,
      authToken: null,
      savedSessionUserId: null,
      savedSessionTabs: [],
      savedSessionAt: null,
      isTracking: false,
      isPaused: false
    })
    chrome.action.setBadgeText({ text: '' })
    sendResponse({ success: true })
  }
  return true
})

function startTracking(newUserId, newAuthToken, newApiBaseUrl) {
  if (newUserId) userId = newUserId
  if (newAuthToken) authToken = newAuthToken
  if (newApiBaseUrl) apiBaseUrl = newApiBaseUrl

  isTracking = true
  isPaused = false

  // Generate unique tracking session ID
  trackingSessionId = `${userId}_${Date.now()}`

  chrome.storage.local.set({
    isTracking,
    userId,
    authToken,
    apiBaseUrl
  })

  chrome.action.setBadgeText({ text: 'ON' })
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })

  // Clear previous session data
  tabTimes.clear()
  currentTabId = null
  currentTabStartTime = null

  // Set up periodic sync every 10 seconds to update time for active tab
  if (syncInterval) clearInterval(syncInterval)
  syncInterval = setInterval(() => {
    if (isTracking && !isPaused && currentTabId) {
      syncTabToServer(currentTabId)
    }
  }, 10000) // Sync every 10 seconds

  // Start keep-alive mechanism
  startKeepAlive()

  // Track the currently active tab immediately
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && !isSpecialUrl(tabs[0].url)) {
      makeTabActive(tabs[0])
    }
  })
}

function stopTracking(callback) {
  isTracking = false
  isPaused = false

  // Clear the periodic sync interval
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }

  // Stop keep-alive
  stopKeepAlive()

  // Accumulate time for the active tab before stopping
  if (currentTabId && currentTabStartTime && tabTimes.has(currentTabId)) {
    const activeTab = tabTimes.get(currentTabId)
    if (activeTab) {
      activeTab.totalTime += Date.now() - currentTabStartTime
    }
  }

  // Sync ALL tracked tabs to server (not just the active one)
  const allTabIds = Array.from(tabTimes.keys())
  for (const tabId of allTabIds) {
    syncTabToServer(tabId)
  }

  // Delay to allow final sync to complete (increased from 500ms to 2000ms)
  setTimeout(() => {
    // Save current tabs for resume
    const currentTabs = getActiveTabsArray()
    if (currentTabs.length > 0) {
      hasSavedSession = true
      chrome.storage.local.set({
        savedSessionTabs: currentTabs,
        savedSessionAt: new Date().toISOString(),
        savedSessionUserId: userId  // Store userId to verify on resume
      })
    } else {
      hasSavedSession = false
    }

    currentTabId = null
    currentTabStartTime = null
    tabTimes.clear()

    chrome.storage.local.set({ isTracking: false, isPaused: false })
    chrome.action.setBadgeText({ text: '' })

    // Call callback if provided
    if (callback) callback()
  }, 500)
}

function pauseTracking() {
  isPaused = true
  chrome.storage.local.set({ isPaused: true })
  chrome.action.setBadgeText({ text: 'PAUSED' })
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' })
}

function resumeTracking() {
  isPaused = false
  chrome.storage.local.set({ isPaused: false })
  chrome.action.setBadgeText({ text: 'ON' })
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })

  // Track the current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && !isSpecialUrl(tabs[0].url)) {
      makeTabActive(tabs[0])
    }
  })
}

function resumeActivity() {
  chrome.storage.local.get(['savedSessionTabs', 'savedSessionUserId', 'userId', 'authToken', 'apiBaseUrl'], (result) => {
    const savedTabs = result.savedSessionTabs || []
    const savedSessionUserId = result.savedSessionUserId
    const currentUserId = result.userId

    userId = result.userId
    authToken = result.authToken
    if (result.apiBaseUrl) apiBaseUrl = result.apiBaseUrl

    // Only resume activity if saved session belongs to current user
    // This prevents showing another user's tracked activity
    if (savedTabs.length > 0 && savedSessionUserId === currentUserId) {
      const uniqueUrls = [...new Set(savedTabs.map(tab => tab.url))]
      chrome.windows.create({ url: uniqueUrls, focused: true })
    } else if (savedTabs.length > 0 && savedSessionUserId !== currentUserId) {
      // Clear saved session from previous user
      chrome.storage.local.set({ savedSessionTabs: [], savedSessionUserId: null, savedSessionAt: null })
    }

    isTracking = true
    isPaused = false

    chrome.storage.local.set({ isTracking, isPaused: false })
    chrome.action.setBadgeText({ text: 'ON' })
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
  })
}

function openSavedTabs() {
  chrome.storage.local.get(['savedSessionTabs', 'savedSessionUserId', 'userId'], (result) => {
    const savedTabs = result.savedSessionTabs || []
    const savedUserId = result.savedSessionUserId
    const currentUserId = result.userId
    // Only open tabs if saved session belongs to current user
    if (savedTabs.length === 0 || (savedUserId && savedUserId !== currentUserId)) return

    const uniqueUrls = [...new Set(savedTabs.map(tab => tab.url))]
    chrome.windows.create({ url: uniqueUrls, focused: true })
  })
}

function openUrls(urls) {
  if (!urls || urls.length === 0) return
  const uniqueUrls = [...new Set(urls)]
  chrome.windows.create({ url: uniqueUrls, focused: true })
}

// ========== EVENT LISTENERS ==========

// When a new tab is created (catches tabs opened with a URL, e.g. Ctrl+click)
chrome.tabs.onCreated.addListener((tab) => {
  if (!isTracking || isPaused) return
  if (!tab.url || isSpecialUrl(tab.url)) return
  if (!tab.id || tabTimes.has(tab.id)) return
  makeTabActive(tab)
})

// When tab is activated (switched to)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!isTracking || isPaused) return

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    if (tab.url && !isSpecialUrl(tab.url)) {
      makeTabActive(tab)
    }
  } catch {
    // Error on tab activated, continue
  }
})

// When tab is updated (URL changes or title changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!isTracking || isPaused) return
  if (isSpecialUrl(tab.url)) return
  if (!tab.url) return

  const tabData = tabTimes.get(tabId)
  if (!tabData) {
    // Tab wasn't tracked yet (e.g. opened as chrome://newtab then navigated to a real URL).
    // Start tracking it now so the first visit is captured.
    makeTabActive(tab)
    return
  }

  const oldUrl = tabData.url
  const newUrl = tab.url
  const domain = extractDomain(newUrl)

  // If URL changed
  if (oldUrl !== newUrl) {
    tabData.url = newUrl
    tabData.domain = domain
    tabData.lastSyncTime = Date.now()

    const currentTitle = (tab.title && tab.title !== newUrl) ? tab.title : newUrl
    tabData.title = currentTitle

    syncTabToServer(tabId)
  } else if (changeInfo.title && tab.title) {
    // Just title changed
    tabData.title = tab.title
    syncTabToServer(tabId)
  }
})

// When tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isTracking || isPaused) return

  if (tabId === currentTabId) {
    currentTabId = null
    currentTabStartTime = null
  }

  tabTimes.delete(tabId)
})

// When window is focused
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (!isTracking || isPaused || windowId === chrome.windows.WINDOW_ID_NONE) return

  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    if (tabs[0] && tabs[0].url && !isSpecialUrl(tabs[0].url)) {
      makeTabActive(tabs[0])
    }
  })
})

// Start tracking a tab as active
function makeTabActive(tab) {
  // Don't track special URLs (chrome://, etc.)
  if (isSpecialUrl(tab.url)) return

  // In manual mode, only track workstack.vercel.app
  if (!isAutomaticMode && extractDomain(tab.url) !== 'workstack.vercel.app') return

  const domain = extractDomain(tab.url)
  const now = Date.now()
  const isNewTab = !tabTimes.has(tab.id)

  // Before switching tabs, accumulate time spent on previous tab
  if (currentTabId && currentTabStartTime && currentTabId !== tab.id) {
    const prevTab = tabTimes.get(currentTabId)
    if (prevTab) {
      const timeSpent = now - currentTabStartTime
      prevTab.totalTime += timeSpent
      prevTab.lastSyncTime = now
    }
  }

  if (tabTimes.has(tab.id)) {
    const existing = tabTimes.get(tab.id)
    existing.url = tab.url
    existing.domain = domain
    existing.title = tab.title || tab.url
    existing.lastSyncTime = now
  } else {
    tabTimes.set(tab.id, {
      url: tab.url,
      title: tab.title || tab.url,
      domain: domain,
      totalTime: 0,
      lastSyncTime: now,
      dbRecordId: null
    })
    apiCallQueue.set(tab.id, [])
  }

  currentTabId = tab.id
  currentTabStartTime = now

  syncTabToServer(tab.id, isNewTab)
}

chrome.runtime.onInstalled.addListener(() => {
  // Extension installed
})
