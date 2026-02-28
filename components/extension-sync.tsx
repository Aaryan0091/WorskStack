'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getExtensionId } from '@/lib/extension-detect'

export function ExtensionSync() {
  const syncAttempted = useRef(false)

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    const chrome = (window as typeof window & { chrome?: { runtime?: { sendMessage?: (id: string, msg: Record<string, unknown>, cb: (r: { success?: boolean } | undefined) => void) => void; lastError?: { message?: string } } } }).chrome
    if (!chrome?.runtime) return

    // Function to sync auth token to extension
    const syncToken = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.warn('Extension sync: Session error:', sessionError.message)
          return
        }

        if (!session?.access_token) {
          console.log('Extension sync: No active session')
          return
        }

        let responded = false
        const timeout = setTimeout(() => {
          if (!responded) {
            responded = true
            console.log('Extension sync: No response (extension may not be installed)')
          }
        }, 1000)

        chrome.runtime?.sendMessage?.(getExtensionId() || '', {
          action: 'storeAuthToken',
          authToken: session.access_token,
          apiBaseUrl: window.location.origin
        }, (response: { success?: boolean } | undefined) => {
          if (responded) return
          responded = true
          clearTimeout(timeout)

          if (chrome.runtime?.lastError) {
            console.log('Extension sync: Extension not reachable')
          } else if (response?.success) {
            console.log('Extension sync: Auth token synced successfully')
          }
        })
      } catch (error) {
        console.error('Extension sync error:', error)
      }
    }

    // Sync token on mount (once)
    if (!syncAttempted.current) {
      syncAttempted.current = true
      syncToken()
    }

    // Listen for auth state changes and sync token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: { access_token?: string } | null) => {
      console.log('Auth state changed:', event)

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session?.access_token) {
          chrome.runtime?.sendMessage?.(getExtensionId() || '', {
            action: 'storeAuthToken',
            authToken: session.access_token,
            apiBaseUrl: window.location.origin
          }, (response: { success?: boolean } | undefined) => {
            if (chrome.runtime?.lastError) {
              console.log('Extension sync: Failed to sync token after auth change')
            } else {
              console.log('Extension sync: Token synced after', event)
            }
          })
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return null
}
