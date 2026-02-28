import { updateSession } from '@/lib/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Skip middleware for these paths
const skipPaths = ['/login', '/register', '/share', '/_next', '/api/auth', '/api']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for public routes and static assets
  if (skipPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
