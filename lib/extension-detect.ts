'use client'

/**
 * Dynamically detects the WorkStack extension ID.
 * This allows the same extension to work on Chrome, Brave, Edge, and other Chromium browsers.
 *
 * Detection methods (tried in order):
 * 1. postMessage from content script (dynamic, works for any unpacked extension)
 * 2. Ping message via externally_connectable (requires known extension ID)
 */

// Known extension IDs for Chrome Web Store and production
const PRODUCTION_EXTENSION_ID = 'llahljdmcglglkcaadldnbpcpnkdinco'

let cachedExtensionId: string | null = null
let extensionInstalledByPostMessage = false
let hasRequestedExtensionId = false

/**
 * Check if the extension is installed via content script marker or postMessage
 */
export function isExtensionInstalledViaContentScript(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as any
  return win.workStackExtensionInstalled === true || extensionInstalledByPostMessage
}

/**
 * Request extension ID from content script via postMessage
 * Returns a promise that resolves with the extension ID or null after timeout
 */
function requestExtensionIdFromContentScript(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }

    const timeout = setTimeout(() => {
      resolve(null)
    }, 2000)

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'workstack-extension-id-response') {
        clearTimeout(timeout)
        window.removeEventListener('message', handleMessage)
        resolve(event.data.extensionId || null)
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
      cachedExtensionId = event.data.extensionId
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
  const win = window as any
  return win.workStackExtensionId || null
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
export function sendExtensionMessage(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Not in browser context'))
      return
    }

    const chrome = (window as any).chrome
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('Chrome runtime not available'))
      return
    }

    // If we have a cached ID from postMessage, use it
    const extensionId = cachedExtensionId || PRODUCTION_EXTENSION_ID

    chrome.runtime.sendMessage(extensionId, message, (response: any) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(response)
      }
    })
  })
}

/**
 * Check if the WorkStack extension is installed
 */
export async function isExtensionInstalled(): Promise<boolean> {
  try {
    const response = await sendExtensionMessage({ action: 'ping' })
    return response?.success === true
  } catch {
    return false
  }
}

/**
 * Get the extension ID with a timeout
 * Useful for checking if extension is responsive
 */
export async function checkExtensionWithTimeout(timeoutMs: number = 1000): Promise<boolean> {
  return Promise.race([
    isExtensionInstalled(),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ])
}
