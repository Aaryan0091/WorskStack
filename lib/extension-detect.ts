'use client'

/**
 * Dynamically detects the WorkStack extension ID.
 * This allows the same extension to work on Chrome, Brave, Edge, and other Chromium browsers.
 *
 * Detection methods (tried in order):
 * 1. postMessage from content script (dynamic, works for any unpacked extension)
 * 2. Ping message via externally_connectable (requires known extension ID)
 */

// Extension message types
export interface ExtensionMessage {
  action: string
  [key: string]: unknown
}

export interface ExtensionResponse {
  success?: boolean
  isTracking?: boolean
  isPaused?: boolean
  isAutomaticMode?: boolean
  hasSavedSession?: boolean
  sessionTabs?: unknown[]
  version?: string
  [key: string]: unknown
}

// Production extension ID from environment variable
// Users must set NEXT_PUBLIC_EXTENSION_ID to their published extension ID
const PRODUCTION_EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || ''

// Common unpacked extension ID pattern for development
// Chrome generates deterministic IDs for unpacked extensions
// Pattern: <32-character-hash>
const KNOWN_DEV_EXTENSION_IDS: string[] = []

let cachedExtensionId: string | null = null
let extensionInstalledByPostMessage = false
let hasRequestedExtensionId = false

// Extend Window interface for WorkStack extension properties
declare global {
  interface Window {
    workStackExtensionId?: string
    workStackExtensionInstalled?: boolean
    chrome?: {
      runtime?: {
        id?: string
        sendMessage?: (
          extensionId: string,
          message: ExtensionMessage,
          callback?: (response: ExtensionResponse) => void
        ) => void
        lastError?: { message?: string }
      }
    }
  }
}

/**
 * Check if the extension is installed via content script marker or postMessage
 */
export function isExtensionInstalledViaContentScript(): boolean {
  if (typeof window === 'undefined') return false
  return window.workStackExtensionInstalled === true || extensionInstalledByPostMessage
}

/**
 * Request extension ID from content script via postMessage
 * Returns a promise that resolves with the extension ID or null after timeout
 */
export function requestExtensionIdFromContentScript(timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }

    const timeout = setTimeout(() => {
      resolve(null)
    }, timeoutMs)

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'workstack-extension-id-response') {
        clearTimeout(timeout)
        window.removeEventListener('message', handleMessage)
        resolve((event.data.extensionId as string) || null)
      }
    }

    window.addEventListener('message', handleMessage)

    // Send request to content script
    window.postMessage({
      type: 'workstack-request-extension-id'
    }, '*')
  })
}

/**
 * Set up postMessage listener to receive extension announcements
 */
function setupPostMessageListener(): void {
  if (typeof window === 'undefined' || hasRequestedExtensionId) return

  hasRequestedExtensionId = true

  window.addEventListener('message', (event) => {
    // Handle extension announcement
    if (event.data?.type === 'workstack-extension-installed' && event.data.extensionId) {
      extensionInstalledByPostMessage = true
      cachedExtensionId = event.data.extensionId as string
    }
  })

  // Also request the ID proactively
  requestExtensionIdFromContentScript().then((id) => {
    if (id) {
      extensionInstalledByPostMessage = true
      cachedExtensionId = id
    }
  })
}

// Set up listener on module load
if (typeof window !== 'undefined') {
  setupPostMessageListener()
}

/**
 * Get the extension ID from content script marker
 */
export function getExtensionIdFromContentScript(): string | null {
  if (typeof window === 'undefined') return null
  return window.workStackExtensionId || null
}

/**
 * Get the extension ID
 * Tries multiple methods: content script, postMessage, and known production ID
 */
export function getExtensionId(): string | null {
  if (typeof window === 'undefined') return null

  // Return cached ID if available
  if (cachedExtensionId) return cachedExtensionId

  // First try: content script marker
  const fromContentScript = getExtensionIdFromContentScript()
  if (fromContentScript) {
    cachedExtensionId = fromContentScript
    return fromContentScript
  }

  // Second try: use production extension ID (for Chrome Web Store users)
  // This works because the extension has "externally_connectable" configured
  cachedExtensionId = PRODUCTION_EXTENSION_ID
  return PRODUCTION_EXTENSION_ID
}

/**
 * Synchronous version - same as getExtensionId now
 */
export function getExtensionIdSync(): string | null {
  return getExtensionId()
}

/**
 * Send a message to the extension
 * Returns a promise that resolves with the response or rejects on error
 */
export function sendExtensionMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Not in browser context'))
      return
    }

    const chrome = window.chrome
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('Chrome runtime not available'))
      return
    }

    // Build list of possible extension IDs to try
    const possibleIds = new Set<string>()

    // Priority 1: Cached ID from content script
    if (cachedExtensionId) possibleIds.add(cachedExtensionId)

    // Priority 2: Production extension ID from env
    if (PRODUCTION_EXTENSION_ID) possibleIds.add(PRODUCTION_EXTENSION_ID)

    // Priority 3: Known dev IDs (for unpacked extensions)
    KNOWN_DEV_EXTENSION_IDS.forEach(id => possibleIds.add(id))

    // Try each ID until one works
    const trySend = (ids: string[], index = 0): void => {
      if (index >= ids.length) {
        // All IDs failed
        reject(new Error('Extension not reachable with any known ID'))
        return
      }

      const extensionId = ids[index]
      chrome.runtime?.sendMessage?.(extensionId, message, (response: ExtensionResponse) => {
        if (chrome.runtime?.lastError) {
          // Try next ID
          trySend(ids, index + 1)
        } else {
          // This ID worked - cache it
          if (extensionId && !cachedExtensionId) {
            cachedExtensionId = extensionId
          }
          resolve(response)
        }
      })
    }

    trySend(Array.from(possibleIds), 0)
  })
}

/**
 * Check if the WorkStack extension is installed
 * Tries multiple times with increasing delays to handle race conditions
 */
export async function isExtensionInstalled(retries = 3, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await sendExtensionMessage({ action: 'ping' })
      if (response?.success === true) {
        return true
      }
    } catch {
      // Ignore errors and retry
    }
    // Wait before next retry
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  return false
}

/**
 * Get the extension ID with a timeout
 * Useful for checking if extension is responsive
 */
export async function checkExtensionWithTimeout(timeoutMs: number = 3000): Promise<boolean> {
  return Promise.race([
    isExtensionInstalled(5, 600),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ])
}

/**
 * Check if the WorkStack extension is installed
 * Uses a longer timeout and retry approach for better reliability
 */
export async function checkExtensionLocal(retries = 5, delayMs = 600): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await sendExtensionMessage({ action: 'ping' })
      if (response?.success === true) {
        return true
      }
    } catch {
      // Ignore errors and retry
    }
    // Wait before next retry
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  return false
}
