'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { markUserSignedIn } from '@/lib/guest-storage'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // The OAuth callback will be handled by Supabase automatically
        // We just need to check the session
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          setStatus('error')
          setErrorMessage(error.message)
          setTimeout(() => {
            router.push('/login?error=' + encodeURIComponent(error.message))
          }, 2000)
          return
        }

        if (session) {
          setStatus('success')
          // Mark user as signed in
          markUserSignedIn()

          // Check if there's a redirect URL
          const redirectTo = searchParams.get('redirect') || '/'
          setTimeout(() => {
            router.push(redirectTo)
            router.refresh()
          }, 500)
        } else {
          // No session, might need to handle the code manually
          const code = searchParams.get('code')
          if (code) {
            // Exchange code for session
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) {
              setStatus('error')
              setErrorMessage(exchangeError.message)
              setTimeout(() => {
                router.push('/login?error=' + encodeURIComponent(exchangeError.message))
              }, 2000)
              return
            }

            if (data.session) {
              setStatus('success')
              markUserSignedIn()
              setTimeout(() => {
                router.push('/')
                router.refresh()
              }, 500)
            }
          } else {
            setStatus('error')
            setErrorMessage('No session found')
            setTimeout(() => {
              router.push('/login')
            }, 2000)
          }
        }
      } catch (err) {
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed')
        setTimeout(() => {
          router.push('/login?error=' + encodeURIComponent('Authentication failed'))
        }, 2000)
      }
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="text-center">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-gray-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4" />
            <p style={{ color: 'var(--text-secondary)' }}>Signing you in...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p style={{ color: 'var(--text-primary)' }}>Successfully signed in!</p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Redirecting...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p style={{ color: 'var(--text-primary)' }}>Sign in failed</p>
            {errorMessage && (
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{errorMessage}</p>
            )}
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Redirecting to login...</p>
          </>
        )}
      </div>
    </div>
  )
}
