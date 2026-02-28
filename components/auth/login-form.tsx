'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { markUserSignedIn } from '@/lib/guest-storage'
import { GoogleSignInButton } from './google-signin-button'
import { getExtensionId } from '@/lib/extension-detect'

// Type for Chrome runtime message response
interface ChromeMessageResponse {
  success?: boolean
  [key: string]: unknown
}

// Extended Window interface for Chrome
interface ChromeWindow extends Window {
  chrome?: {
    runtime?: {
      sendMessage?: (
        extensionId: string,
        message: Record<string, unknown>,
        callback?: (response: ChromeMessageResponse) => void
      ) => void
      lastError?: { message?: string }
      id?: string
    }
  }
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // Store auth token in extension after login
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: { access_token?: string } | null) => {
      // Store token on sign in and when token refreshes
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.access_token) {
        const apiBaseUrl = window.location.origin
        const chromeWindow = window as ChromeWindow

        if (chromeWindow.chrome?.runtime) {
          let responded = false
          // Fast timeout to prevent hanging on non-Chrome browsers or when extension not installed
          const timeout = setTimeout(() => {
            if (!responded) {
              responded = true
            }
          }, 500)

          // Send auth token to extension
          chromeWindow.chrome.runtime.sendMessage?.(getExtensionId() || '', {
            action: 'storeAuthToken',
            authToken: session.access_token,
            apiBaseUrl
          }, (response: ChromeMessageResponse) => {
            if (responded) return
            responded = true
            clearTimeout(timeout)

            if (chromeWindow.chrome?.runtime?.lastError) {
              // Extension not installed or not reachable - silently ignore
            }
          })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      // Mark user as signed in so their guest data won't be cleared on close
      markUserSignedIn()
      // Use router.push instead of window.location
      router.push('/')
      router.refresh()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to login'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleLogin} className="space-y-5" aria-label="Sign in form">
      {/* Email input with icon */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </span>
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-required="true"
          autoComplete="email"
          className="w-full pl-10 pr-4 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-all"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: error ? '#ef4444' : 'var(--border-color)',
            color: 'var(--text-primary)'
          }}
        />
      </div>

      {/* Password input with icon and show/hide */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </span>
        <label htmlFor="password" className="sr-only">Password</label>
        <input
          id="password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-required="true"
          autoComplete="current-password"
          className="w-full pl-10 pr-12 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-all"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: error ? '#ef4444' : 'var(--border-color)',
            color: 'var(--text-primary)'
          }}
        />
        <button
          id="toggle-password"
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-pressed={showPassword}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-all hover:scale-110"
          style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          {showPassword ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Forgot password link */}
      <div className="flex justify-end">
        <button type="button" className="text-sm hover:underline transition-all" style={{ color: '#8b5cf6' }}>
          Forgot password?
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg" role="alert" aria-live="polite" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="#ef4444" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm" style={{ color: '#ef4444' }}>{error}</span>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="w-full py-3 rounded-lg font-medium transition-all duration-75 active:scale-95 hover:scale-[1.02] flex items-center justify-center gap-2"
        style={{
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          color: 'white',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1
        }}
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <span>Sign in</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </>
        )}
      </button>
      </form>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="absolute border-b" style={{ borderColor: 'var(--border-color)', width: '100%' }}></div>
        <span className="relative px-4 text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
          Or continue with
        </span>
      </div>

      {/* Google Sign In Button */}
      <GoogleSignInButton
        mode="signin"
        onError={setError}
      />
    </div>
  )
}
