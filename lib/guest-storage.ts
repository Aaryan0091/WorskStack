'use client'

import type { Bookmark, Collection, Tag } from './types'

// Key to track if user signed in during this session
const SIGNED_IN_KEY = 'workstack_signed_in_this_session'
const GUEST_MODE_KEY = 'workstack_is_guest_mode'

// Type for stored data (JSON serializable)
type StoredValue = string | number | boolean | null | object | Array<unknown>

// Sanitize input before storing to localStorage
function sanitizeValue(value: unknown): StoredValue {
  if (value === null || value === undefined) return null

  // Primitive types are safe
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  // Arrays and objects - recursively sanitize
  if (Array.isArray(value)) {
    return value.map((item: unknown) => sanitizeValue(item))
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, StoredValue> = {}
    for (const [key, val] of Object.entries(value)) {
      // Only allow string keys (prevent prototype pollution)
      if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(value, key)) {
        sanitized[key] = sanitizeValue(val)
      }
    }
    return sanitized
  }

  return null
}

// Simple helpers for localStorage (persists on refresh, cleared on browser close)
// We use localStorage for data persistence and clear it on beforeunload
export function guestStoreGet<T = StoredValue>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const item = localStorage.getItem(key)
    if (!item) return null
    return JSON.parse(item) as T
  } catch {
    return null
  }
}

export function guestStoreSet(key: string, value: StoredValue): void {
  if (typeof window === 'undefined') return
  try {
    const sanitized = sanitizeValue(value)
    localStorage.setItem(key, JSON.stringify(sanitized))
  } catch {
    // Silently fail if localStorage is full or unavailable
  }
}

export function guestStoreRemove(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    // Silently fail
  }
}

// Keys for localStorage
export const GUEST_KEYS = {
  BOOKMARKS: 'workstack_guest_bookmarks',
  COLLECTIONS: 'workstack_guest_collections',
  TAGS: 'workstack_guest_tags',
  SIGNED_IN: SIGNED_IN_KEY,
  GUEST_MODE: GUEST_MODE_KEY
} as const

/**
 * Mark that the user has signed in
 * This prevents guest data from being cleared on browser close
 */
export function markUserSignedIn(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SIGNED_IN_KEY, 'true')
    // Clear guest mode flag since user is now signed in
    localStorage.removeItem(GUEST_MODE_KEY)
  } catch {
    // Silently fail
  }
}

/**
 * Mark user as guest mode (data persists on refresh, clears on close)
 */
export function markGuestMode(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(GUEST_MODE_KEY, 'true')
  } catch {
    // Silently fail
  }
}

/**
 * Check if user signed in
 */
export function hasUserSignedIn(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Check if user is in guest mode
 */
export function isGuestMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(GUEST_MODE_KEY) === 'true' && !hasUserSignedIn()
  } catch {
    return false
  }
}

/**
 * Clear all guest data
 * Call this when user closes site without signing in
 */
export function clearGuestData(): void {
  if (typeof window === 'undefined') return
  try {
    Object.values(GUEST_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
  } catch {
    // Silently fail
  }
}

/**
 * Get all guest data for syncing
 */
export function getAllGuestData(): {
  bookmarks: Bookmark[] | null
  collections: Collection[] | null
  tags: Tag[] | null
} {
  return {
    bookmarks: guestStoreGet<Bookmark[]>(GUEST_KEYS.BOOKMARKS),
    collections: guestStoreGet<Collection[]>(GUEST_KEYS.COLLECTIONS),
    tags: guestStoreGet<Tag[]>(GUEST_KEYS.TAGS)
  }
}

// Track cleanup function to avoid multiple listeners
let cleanupFn: (() => void) | null = null

/**
 * Setup cleanup listener for guest mode
 * Clears data when browser is closed (beforeunload) if user hasn't signed in
 * Only sets up the listener once
 */
export function setupGuestCleanup(): () => void {
  if (typeof window === 'undefined') return () => {}

  // Return existing cleanup if already set up
  if (cleanupFn) return cleanupFn

  const handleBeforeUnload = () => {
    // Only clear if user is still in guest mode (never signed in)
    if (!hasUserSignedIn() && isGuestMode()) {
      clearGuestData()
    }
  }

  // Listen for page unload (browser close)
  window.addEventListener('beforeunload', handleBeforeUnload)

  // Create cleanup function
  cleanupFn = () => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    cleanupFn = null
  }

  return cleanupFn
}

/**
 * Teardown cleanup listener (call when component unmounts)
 */
export function teardownGuestCleanup(): void {
  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }
}

/**
 * Check if there's any guest data stored
 */
export function hasGuestData(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Object.values(GUEST_KEYS).some(key => {
      if (key === SIGNED_IN_KEY || key === GUEST_MODE_KEY) return false
      return localStorage.getItem(key) !== null
    })
  } catch {
    return false
  }
}
