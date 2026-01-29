'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from 'next-themes'
import { Modal } from '@/components/ui/modal'

interface NavItem {
  href: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/bookmarks', label: 'Bookmarks', icon: '🔖' },
  { href: '/reading-list', label: 'Reading List', icon: '📚' },
  { href: '/collections', label: 'Collections', icon: '📦' },
  { href: '/tracked-activity', label: 'Tracked Activity', icon: '📊' },
  { href: '/smart-search', label: 'AI Smart Search', icon: '🤖' },
]

// Simple cache for user email to avoid repeated fetches
let cachedEmail: string | null = null
let emailFetchInProgress = false

async function getCachedEmail(): Promise<string | null> {
  if (cachedEmail) return cachedEmail
  if (emailFetchInProgress) return null

  emailFetchInProgress = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    cachedEmail = user?.email || null
    return cachedEmail
  } finally {
    emailFetchInProgress = false
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Use cached email to avoid repeated fetches
    getCachedEmail().then(e => {
      if (e) setEmail(e)
    })

    // Prefetch all routes on mount for instant navigation
    navItems.forEach((item) => {
      router.prefetch(item.href)
    })
  }, [])

  const handleLogout = async () => {
    setShowLogoutModal(true)
  }

  const confirmLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    // Clear guest data flag to allow sync prompt again if they sign back in
    localStorage.removeItem('workstack_sync_prompt_shown')
    window.location.href = '/login'
  }

  return (
    <aside
      className="w-64 border-r h-screen fixed left-0 top-0 flex flex-col"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-primary)'
      }}
    >
      <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            WorkStack
          </h1>
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' || theme === undefined ? 'light' : 'dark')}
              className="transition-all duration-75 active:scale-90"
              style={{
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' || theme === undefined ? '☀️' : '🌙'}
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-75 active:scale-95"
              style={{
                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: isActive ? '#3b82f6' : 'var(--text-primary)'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  router.prefetch(item.href)
                  e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        {email && (
          <p className="text-xs truncate mb-3 px-1" style={{ color: 'var(--text-secondary)' }}>{email}</p>
        )}
        {email ? (
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full transition-all duration-75 active:scale-95"
            style={{ color: 'var(--text-primary)', cursor: 'pointer' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg w-full text-sm font-medium transition-all duration-75 active:scale-90 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            <span>Sign up</span>
          </Link>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      <Modal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} title="Confirm Logout">
        <div className="space-y-5">
          {/* Header with icon */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3" style={{
              background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)'
            }}>
              <span className="text-3xl">🚪</span>
            </div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Are you sure you want to logout?</h2>
          </div>

          {/* Warning about guest data */}
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: '#ea580c' }}>Important Notice</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  After logging out, any activity you do <strong>without being logged in</strong> will be stored temporarily and <strong>lost when you close the browser</strong>.
                </p>
                <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                  Sign in to keep your data saved permanently in the cloud.
                </p>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowLogoutModal(false)}
              disabled={loggingOut}
              className="flex-1 px-4 py-3 rounded-lg font-medium transition-all active:scale-95"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmLogout}
              disabled={loggingOut}
              className="flex-1 px-4 py-3 rounded-lg font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)', color: 'white', cursor: 'pointer' }}
            >
              {loggingOut ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging out...
                </>
              ) : (
                <>
                  <span>Yes, Logout</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </aside>
  )
}
