import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Only redirect to login if explicitly trying to access a protected route
// Allow guest users to browse the site freely
export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const cookies = request.cookies.getAll()

  // Fast path: check if Supabase auth cookie exists
  const authCookie = cookies.find(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
  const hasAuthCookie = !!authCookie

  // Create response
  const supabaseResponse = NextResponse.next({
    request,
  })

  // Public routes - always accessible
  const isPublicRoute = pathname.startsWith('/login') || pathname.startsWith('/share') || pathname.startsWith('/api')

  // If on login page and already has auth cookie, redirect to home
  if (hasAuthCookie && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // For all other routes, allow access (guest mode enabled)
  // Just set up Supabase client for cookie handling if needed
  if (hasAuthCookie) {
    createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          },
          remove(name: string, options: Record<string, unknown>) {
            request.cookies.delete(name)
            supabaseResponse.cookies.delete(name)
          },
        },
      }
    )
  }

  return supabaseResponse
}
