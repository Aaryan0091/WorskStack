'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from 'next-themes'
import { Modal } from '@/components/ui/modal'
import {
  LayoutDashboard,
  Bookmark,
  BookOpen,
  FolderKanban,
  BarChart3,
  Sparkles,
  Tag,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, color: 'var(--color-indigo)' },
  { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark, color: 'var(--color-sky)' },
  { href: '/reading-list', label: 'Reading List', icon: BookOpen, color: 'var(--color-amber)' },
  { href: '/collections', label: 'Collections', icon: FolderKanban, color: 'var(--color-purple)' },
  { href: '/tracked-activity', label: 'Tracked Activity', icon: BarChart3, color: 'var(--color-emerald)' },
  { href: '/smart-search', label: 'AI Smart Search', icon: Sparkles, color: 'var(--color-pink)' },
  { href: '/tags', label: 'Tags', icon: Tag, color: 'var(--color-orange)' },
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

// Mobile sidebar state management (global so it can be controlled from outside)
let mobileSidebarOpen = false
const mobileSidebarListeners: Set<() => void> = new Set()

export function toggleMobileSidebar() {
  mobileSidebarOpen = !mobileSidebarOpen
  mobileSidebarListeners.forEach(listener => listener())
}

export function closeMobileSidebar() {
  mobileSidebarOpen = false
  mobileSidebarListeners.forEach(listener => listener())
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

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

    // Listen for mobile sidebar toggle events
    const handleMobileToggle = () => setIsMobileOpen(mobileSidebarOpen)
    mobileSidebarListeners.add(handleMobileToggle)

    return () => {
      mobileSidebarListeners.delete(handleMobileToggle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <>
      {/* Mobile backdrop overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${
          isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileSidebar}
      />
      <aside
        className={`w-64 border-r h-screen fixed left-0 top-0 flex flex-col z-50 transition-transform duration-300 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-primary)'
        }}
      >
      <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #8b5cf6 100%)',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
            }}>
              <span className="text-sm font-bold text-white">W</span>
            </div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              WorkStack
            </h1>
          </div>
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' || theme === undefined ? 'light' : 'dark')}
              className="p-2 rounded-lg transition-colors"
              style={{
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' || theme === undefined ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item, index) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200"
              style={{
                backgroundColor: isActive ? item.color : 'transparent',
                color: isActive ? 'white' : 'var(--text-primary)',
                transform: isActive ? 'translateX(4px)' : 'translateX(0)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  router.prefetch(item.href)
                  e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                  e.currentTarget.style.transform = 'translateX(2px)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.transform = 'translateX(0)'
                }
              }}
            >
              <span style={{ color: isActive ? 'white' : item.color }}>
                <Icon className="w-6 h-6" />
              </span>
              <span className="text-base font-semibold">{item.label}</span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-md w-full transition-colors"
            style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg w-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--color-teal)',
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
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{
              backgroundColor: 'rgba(249, 115, 22, 0.15)'
            }}>
              <LogOut className="w-6 h-6" style={{ color: 'var(--color-orange)' }} />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Are you sure you want to logout?</h2>
          </div>

          {/* Warning about guest data */}
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-warm)', border: '1px solid var(--border-color)' }}>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <span className="text-xl" style={{ color: 'var(--color-amber)' }}>⚠️</span>
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Important Notice</p>
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
              className="flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmLogout}
              disabled={loggingOut}
              className="flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--color-danger)', color: 'white', cursor: 'pointer' }}
            >
              {loggingOut ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging out...
                </>
              ) : (
                <>
                  <span>Yes, Logout</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </aside>
    </>
  )
}
