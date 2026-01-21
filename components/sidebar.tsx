'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from 'next-themes'

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
    await supabase.auth.signOut()
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
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="transition-all duration-75 active:scale-90"
              style={{
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
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
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg w-full transition-all duration-75 active:scale-95"
          style={{ color: 'var(--text-primary)' }}
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
      </div>
    </aside>
  )
}
