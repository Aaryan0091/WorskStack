'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isChromiumBased, getBrowserName } from '@/lib/browser-detect'
import { isExtensionInstalledViaContentScript, checkExtensionWithTimeout } from '@/lib/extension-detect'
import { DashboardLayout } from '@/components/dashboard-layout'

export default function ExtensionPage() {
  const router = useRouter()
  const [browser, setBrowser] = useState<string>('')
  const [supported, setSupported] = useState<boolean | null>(true)
  const [mounted, setMounted] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    setMounted(true)
    setBrowser(getBrowserName())
    setSupported(isChromiumBased())

    // Check for extension on mount
    checkExtensionInstalled()

    // Listen for custom event from content script
    const handleExtensionLoaded = () => {
      setExtensionInstalled(true)
    }
    window.addEventListener('workstack-extension-loaded', handleExtensionLoaded)

    // Re-check when tab becomes visible again (user might have just installed extension)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExtensionInstalled()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('workstack-extension-loaded', handleExtensionLoaded)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Calculate scale based on scroll (1.5 at top, 1 at 100px scroll)
  // Only apply animation after component is mounted to avoid hydration mismatch
  const scale = mounted ? Math.max(1, 1.5 - scrollY / 200) : 1
  const opacity = mounted ? Math.max(0.7, 1 - scrollY / 500) : 1

  const checkExtensionInstalled = async () => {
    // First check if content script marker is set (fastest)
    if (isExtensionInstalledViaContentScript()) {
      setExtensionInstalled(true)
      return
    }

    // Also try sending a ping message to the extension
    const isInstalled = await checkExtensionWithTimeout(2000)
    setExtensionInstalled(isInstalled)
  }

  const downloadExtension = async () => {
    setDownloading(true)
    try {
      const response = await fetch('/api/extension-download')
      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'workstack-extension.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download failed:', error)
      alert('Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 3000)
  }

  return (
    <DashboardLayout>
      {/* Back to Dashboard Button - Fixed position, right of sidebar */}
      <div className="fixed top-15 left-72 z-50">
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 rounded-lg font-medium transition-all duration-75 hover:scale-105 active:scale-95 flex items-center gap-2"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div
          className="text-center transition-transform duration-300 ease-out origin-top"
          style={{
            transform: `scale(${scale})`,
            opacity,
            marginBottom: `${2.5 + (scale - 1) * 10}rem`
          }}
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
          }}>
            <span className="text-4xl">📦</span>
          </div>
          <h1 className="text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            WorkStack Extension
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            Track your browsing activity and boost your productivity
          </p>
        </div>

        {/* Download Button Card */}
        <div className="rounded-2xl shadow-lg px-12 py-2 mb-8 w-full max-w-6xl mx-auto" style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.2)'
        }}>
          <div className="text-center">
            {extensionInstalled ? (
              <div className="py-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}>
                  <span className="text-3xl">✓</span>
                </div>
                <h2 className="text-2xl font-bold mb-2" style={{ color: '#22c55e' }}>
                  Extension Installed!
                </h2>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  You are all set! The WorkStack extension is ready to use.
                </p>
                <button
                  onClick={() => router.push('/')}
                  className="px-6 py-3 rounded-xl font-medium transition-all duration-75 hover:scale-105 active:scale-95"
                  style={{ color: '#22c55e', cursor: 'pointer' }}
                >
                  Go to Dashboard
                </button>
              </div>
            ) : (
              <div className="py-2">
                <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Ready to install?
                </h2>
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <button
                    onClick={downloadExtension}
                    disabled={downloading || !mounted || supported === false}
                    className="px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-75 hover:scale-105 active:scale-95 flex items-center gap-3"
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                      color: 'white',
                      cursor: (downloading || !mounted || supported === false) ? 'not-allowed' : 'pointer',
                      opacity: (downloading || !mounted || supported === false) ? 0.6 : 1
                    }}
                  >
                    {downloading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Extension
                      </>
                    )}
                  </button>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    ZIP file • Works on Chrome, Edge, Brave
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Browser compatibility warning */}
        {mounted && !supported && (
          <div className="mb-8 p-5 rounded-xl border-2" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: '#f59e0b' }}>
            <div className="flex items-start gap-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="font-semibold text-lg mb-1" style={{ color: '#b45309' }}>Browser Not Supported</h3>
                <p style={{ color: '#b45309' }}>
                  You are currently using <strong>{browser}</strong>. The WorkStack extension requires a Chromium-based browser (Chrome, Edge, or Brave).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Installation Steps */}
        {!extensionInstalled && mounted && supported && (
          <div className="rounded-xl shadow-lg p-8 mb-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              Installation Instructions
            </h2>

            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ backgroundColor: '#3b82f6', color: 'white' }}>
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Download Extension
                  </h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Click the download button above to get the extension ZIP file.
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    💡 The file is named <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">workstack-extension.zip</code>
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ backgroundColor: '#3b82f6', color: 'white' }}>
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Extract ZIP File
                  </h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Find <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">workstack-extension.zip</code> in your Downloads folder and extract it.
                  </p>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    💡 Right-click ZIP file → "Extract All" (Windows) or double-click to extract (Mac)
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    📁 You will get a <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">workstack-extension</code> folder - remember its location!
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ backgroundColor: '#3b82f6', color: 'white' }}>
                  3
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Open Extensions Page
                  </h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Click a card below to copy the URL, then paste it in your browser address bar:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { name: 'Chrome', url: 'chrome://extensions/', icon: '🌐', color: '#4285f4' },
                      { name: 'Edge', url: 'edge://extensions/', icon: '📘', color: '#0078d4' },
                      { name: 'Brave', url: 'brave://extensions/', icon: '🦁', color: '#fb542b' },
                      { name: 'Opera', url: 'opera://extensions/', icon: '🎭', color: '#ff1b2d' },
                    ].map((item) => (
                      <button
                        key={item.name}
                        onClick={() => copyToClipboard(item.url)}
                        className="p-3 rounded-xl text-center transition-all hover:scale-105 active:scale-95 flex flex-col items-center gap-1"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          cursor: 'pointer',
                          border: `2px solid ${item.color}20`
                        }}
                      >
                        <span className="text-2xl">{item.icon}</span>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                        <p className="text-xs" style={{ color: item.color }}>{item.url}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Click to copy</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 4 - Developer Mode */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ backgroundColor: '#3b82f6', color: 'white' }}>
                  4
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Enable Developer Mode
                  </h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Look for "Developer mode" toggle in the top-right corner and turn it on.
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    💡 This allows you to load unpacked extensions from your computer
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ backgroundColor: '#3b82f6', color: 'white' }}>
                  5
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Load Extension
                  </h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Click "Load unpacked" and select the extracted extension folder.
                  </p>
                  <div className="p-4 rounded-lg border-2 border-dashed flex items-center justify-center gap-3" style={{ borderColor: 'var(--border-color)' }}>
                    <svg className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v2" />
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Select workstack-extension folder</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Troubleshooting */}
        <div className="rounded-xl shadow-lg p-8 mb-8 border-2" style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#f59e0b' }}>
            <span>🔧</span>
            Troubleshooting
          </h2>

          <div className="space-y-4">
            {/* Issue 1 */}
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <h3 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span className="text-red-500">❓</span>
                Extension installed but not detected?
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li><strong>Reload extension:</strong> Go to brave://extensions/ or chrome://extensions/ and click the refresh icon on the WorkStack extension card</li>
                <li><strong>Refresh page:</strong> After reloading the extension, refresh your WorkStack tab</li>
                <li><strong>Check URL:</strong> Make sure you are visiting https://workstack.vercel.app (not with www)</li>
                <li><strong>Disable Brave Shields:</strong> Click the Brave Shields icon and set it to "Do not block anything" for the WorkStack site</li>
              </ol>
            </div>

            {/* Issue 2 */}
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <h3 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span className="text-red-500">❓</span>
                Getting errors in extension?
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li>Open Developer Tools (F12) and go to the Console tab</li>
                <li>Look for red errors related to the extension</li>
                <li>In the extensions page, click Service worker on the WorkStack extension card to see background script errors</li>
              </ol>
            </div>

            {/* Issue 3 */}
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <h3 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span className="text-red-500">❓</span>
                Still not working?
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li><strong>Remove and reinstall:</strong> Click Remove on the extension card, then load it again from the extracted folder</li>
                <li><strong>Check browser compatibility:</strong> Extension only works on Chrome, Edge, and Brave (not Safari or Firefox)</li>
                <li><strong>Restart browser:</strong> Close and reopen your browser after installing the extension</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Check Again Button - shown after installation steps */}
        {!extensionInstalled && mounted && supported && (
          <div className="text-center mb-8">
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              Already installed extension? Click below to check again.
            </p>
            <button
              onClick={checkExtensionInstalled}
              className="px-6 py-3 rounded-xl font-medium transition-all duration-75 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                border: '1px solid var(--border-color)'
              }}
            >
              🔄 Check Again
            </button>
          </div>
        )}

        {/* Features */}
        <div className="rounded-xl shadow-lg p-8 mb-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
            What Can You Do With Extension?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: '🎯', title: 'Track Activity', desc: 'Monitor which tabs you visit and time spent' },
              { icon: '📊', title: 'View Statistics', desc: 'See your browsing habits and productivity insights' },
              { icon: '🔖', title: 'Quick Bookmark', desc: 'Save any page directly from browser' },
              { icon: '📂', title: 'Restore Session', desc: 'Reopen your previously tracked tabs instantly' },
              { icon: '🔒', title: 'Private & Secure', desc: 'All data stored in your personal account' },
              { icon: '⏸️', title: 'Pause Tracking', desc: 'Stop tracking whenever you need privacy' },
            ].map((feature) => (
              <div key={feature.title} className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{feature.icon}</span>
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{feature.title}</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{feature.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Browser Compatibility */}
        <div className="rounded-xl shadow-lg p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Browser Compatibility
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            {[
              { name: 'Chrome', supported: true, icon: '🌐' },
              { name: 'Edge', supported: true, icon: '📘' },
              { name: 'Brave', supported: true, icon: '🦁' },
              { name: 'Safari', supported: false, icon: '🧭' },
              { name: 'Firefox', supported: false, icon: '🦊' },
            ].map((item) => (
              <div key={item.name} className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <span className="text-2xl">{item.icon}</span>
                <p className="font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                <p className="text-xs mt-1" style={{ color: item.supported ? '#22c55e' : '#ef4444' }}>
                  {item.supported ? '✓ Supported' : '✗ Not Supported'}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Toast Notification */}
      {copiedUrl && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50" style={{
          animation: 'slideUp 0.3s ease-out'
        }}>
          <div className="flex items-center gap-4 px-5 py-3 rounded-xl" style={{
            background: 'var(--bg-primary)',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            border: '1px solid var(--border-color)'
          }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
            }}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Copied to clipboard</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Paste <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-secondary)', color: '#8b5cf6' }}>{copiedUrl}</code> in your address bar</p>
            </div>
          </div>
          <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}`}</style>
        </div>
      )}
    </DashboardLayout>
  )
}
