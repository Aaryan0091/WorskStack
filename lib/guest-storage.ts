'use client'

// Simple helpers for sessionStorage (data is lost when browser closes)
export function guestStoreGet(key: string): any {
  if (typeof window === 'undefined') return null
  try {
    const item = sessionStorage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch { return null }
}

export function guestStoreSet(key: string, value: any): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch (e) { console.error('sessionStorage error:', e) }
}

export function guestStoreRemove(key: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(key)
}

// Keys for sessionStorage
export const GUEST_KEYS = {
  BOOKMARKS: 'workstack_guest_bookmarks',
  COLLECTIONS: 'workstack_guest_collections',
  TAGS: 'workstack_guest_tags'
}
