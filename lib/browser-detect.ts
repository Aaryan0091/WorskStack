// Simple browser detection utility
// Uses User Agent for basic detection - not foolproof but sufficient for feature detection

export type Browser = 'chrome' | 'firefox' | 'safari' | 'edge' | 'brave' | 'other'

// Extend Navigator interface to include Brave API
declare global {
  interface Navigator {
    brave?: {
      isBrave?: () => boolean | Promise<boolean>
    }
  }
}

let cachedBrowser: Browser | null = null
let cachedIsMobile: boolean | null = null

export function getBrowser(): Browser {
  if (cachedBrowser) return cachedBrowser

  if (typeof window === 'undefined') return 'other'

  const ua = navigator.userAgent

  // Check for Brave (Brave doesn't identify itself directly, but we can infer)
  // Brave is Chromium-based and doesn't have "Chrome" in UA in some versions
  // We check if it's Chromium-like AND has Brave-specific indicators
  if (
    (ua.includes('Brave') || navigator.brave?.isBrave?.()) ||
    (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR'))
  ) {
    // Further check: Brave usually doesn't have "Chrome" in navigator.appVersion
    // But has Chrome in UA. The navigator.brave API is the most reliable.
    if (navigator.brave && (ua.includes('Brave') || !navigator.brave.isBrave?.())) {
      cachedBrowser = 'brave'
      return 'brave'
    }
    // Fallback: if it has Chrome but not Edge/Opera, could be Brave or Chrome
    // We'll default to chrome for now since Brave is detected as Chromium
  }

  // Edge (Chromium-based)
  if (ua.includes('Edg')) {
    cachedBrowser = 'edge'
    return 'edge'
  }

  // Chrome
  if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) {
    cachedBrowser = 'chrome'
    return 'chrome'
  }

  // Firefox
  if (ua.includes('Firefox')) {
    cachedBrowser = 'firefox'
    return 'firefox'
  }

  // Safari
  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    cachedBrowser = 'safari'
    return 'safari'
  }

  cachedBrowser = 'other'
  return 'other'
}

export function isChromiumBased(): boolean {
  // Mobile devices don't support Chrome extensions
  if (isMobile()) return false

  // Safari is not Chromium-based
  const browser = getBrowser()
  if (browser === 'safari') return false

  return browser === 'chrome' || browser === 'edge' || browser === 'brave'
}

export function supportsExtension(): boolean {
  return isChromiumBased()
}

export function isMobile(): boolean {
  if (cachedIsMobile !== null) return cachedIsMobile

  if (typeof window === 'undefined') return false

  const ua = navigator.userAgent

  // Common mobile indicators
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/
  cachedIsMobile = mobileRegex.test(ua)

  return cachedIsMobile
}

// Get display name for browser
export function getBrowserName(): string {
  const browser = getBrowser()
  const names: Record<Browser, string> = {
    chrome: 'Chrome',
    firefox: 'Firefox',
    safari: 'Safari',
    edge: 'Microsoft Edge',
    brave: 'Brave',
    other: 'your browser'
  }
  return names[browser]
}

// Check if user is on iOS
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && typeof (navigator as typeof navigator & { maxTouchPoints?: number }).maxTouchPoints === 'number' && (navigator as typeof navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
}

// Check if user is on Android
export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false
  return /Android/.test(navigator.userAgent)
}
