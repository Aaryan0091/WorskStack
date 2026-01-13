import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Cache for session validation to reduce redundant calls
const SESSION_CACHE_TTL = 30 * 1000 // 30 seconds
const sessionCache = new Map<string, { data: any; timestamp: number }>()

function getCachedSession(sessionKey: string) {
  const cached = sessionCache.get(sessionKey)
  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL) {
    return cached.data
  }
  sessionCache.delete(sessionKey)
  return null
}

function setCachedSession(sessionKey: string, data: any) {
  sessionCache.set(sessionKey, { data, timestamp: Date.now() })
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const cookies = request.cookies.getAll()

  // Fast path: check if Supabase auth cookie exists
  const authCookie = cookies.find(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
  const hasAuthCookie = !!authCookie

  // Create response immediately
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Public routes - skip auth check entirely
  const isPublicRoute = pathname.startsWith('/login') || pathname.startsWith('/share') || pathname.startsWith('/api')

  // If no auth cookie and trying to access protected route, redirect
  if (!hasAuthCookie && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If has auth cookie and on login page, redirect to home
  if (hasAuthCookie && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // For public routes or when no auth needed, skip Supabase client creation
  if (isPublicRoute || !hasAuthCookie) {
    return supabaseResponse
  }

  // Check cache first
  const cacheKey = authCookie?.name + authCookie?.value?.slice(0, 20)
  const cached = getCachedSession(cacheKey || '')
  if (cached) {
    // Still set up the client for cookie handling, but skip session refresh
    createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          },
          remove(name: string, options: any) {
            request.cookies.delete(name)
            supabaseResponse.cookies.delete(name)
          },
        },
      }
    )
    return supabaseResponse
  }

  // Only create Supabase client and refresh session if not cached
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set(name, value)
          supabaseResponse.cookies.set(name, value, options)
        },
        remove(name: string, options: any) {
          request.cookies.delete(name)
          supabaseResponse.cookies.delete(name)
        },
      },
    }
  )

  // Lightweight session refresh (validates token without full user fetch)
  const { data } = await supabase.auth.getSession()
  if (cacheKey) {
    setCachedSession(cacheKey, data)
  }

  // If session is invalid, redirect to login
  if (!data.session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
