import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
}

// TypeScript knows these are defined after the check above
const SUPABASE_URL: string = supabaseUrl
const SUPABASE_ANON_KEY: string = supabaseAnonKey

/**
 * Standard API response types
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true
  data: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  error: string
  details?: string
  code?: string
}

/**
 * Request body type
 */
export interface RequestBody {
  [key: string]: unknown
}

/**
 * Standard success response
 */
export function apiSuccess<T>(data: T, message?: string, status: number = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    { success: true, data, message },
    { status }
  )
}

/**
 * Standard error response
 */
export function apiError(
  error: string,
  details?: string,
  status: number = 400,
  code?: string
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { success: false, error, details, code },
    { status }
  )
}

/**
 * Handle common API errors
 */
export class ApiError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE: 'DUPLICATE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED'
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * Supabase error codes
 */
interface SupabaseError {
  code?: string
  message?: string
  details?: string
}

/**
 * Wrap API route handlers with try-catch and consistent error handling
 */
export function withApiHandler<T extends NextRequest = NextRequest, C = unknown>(
  handler: (req: T, context?: C) => Promise<NextResponse>
) {
  return async (req: T, context?: C): Promise<NextResponse> => {
    try {
      return await handler(req, context)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('API Error:', error)
      }

      if (error instanceof ApiError) {
        return apiError(error.message, undefined, error.statusCode, error.code)
      }

      // Handle Supabase errors
      if (error && typeof error === 'object' && 'code' in error) {
        const supabaseError = error as SupabaseError
        switch (supabaseError.code) {
          case 'PGRST116':
            return apiError('Resource not found', undefined, 404, ErrorCodes.NOT_FOUND)
          case '23505':
            return apiError('Resource already exists', undefined, 409, ErrorCodes.DUPLICATE)
          case '23503':
            return apiError('Referenced resource does not exist', undefined, 400, ErrorCodes.INVALID_INPUT)
          case '42501':
            return apiError('Access denied', undefined, 403, ErrorCodes.FORBIDDEN)
        }
      }

      // Generic error
      return apiError(
        'An unexpected error occurred',
        process.env.NODE_ENV === 'development' ? String(error) : undefined,
        500,
        ErrorCodes.INTERNAL_ERROR
      )
    }
  }
}

/**
 * Validate required fields in request body
 */
export function validateRequired(body: RequestBody, fields: string[]): string | null {
  for (const field of fields) {
    const value = body[field]
    if (!value || (typeof value === 'string' && !(value as string).trim())) {
      return `Field '${field}' is required`
    }
  }
  return null
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Sanitize user input (basic XSS prevention)
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
}

/**
 * Verify auth token and get user
 * Shared authentication helper for all API routes
 */
export async function getUserFromToken(authHeader: string | null): Promise<User | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Auth error:', error?.message)
    }
    return null
  }

  return data.user
}

/**
 * Helper to add CORS headers for extension requests
 * Shared CORS helper for all API routes
 * Only allows requests from same origin, localhost (dev), and chrome extensions
 */
export function corsHeaders(response: NextResponse, request?: NextRequest): NextResponse {
  const origin = request?.headers.get('origin')

  // Allowed origins patterns
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  const allowedPatterns = [
    // Same origin
    appUrl ? (appUrl.startsWith('http') ? appUrl : `https://${appUrl}`) : null,
    // Development localhost
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    // Chrome extensions (any)
    'chrome-extension://',
  ].filter(Boolean) as string[]

  // Check if origin is allowed
  let isAllowed = false
  if (origin) {
    isAllowed = allowedPatterns.some(pattern => {
      if (pattern.endsWith('://')) {
        // Pattern ends with :// means we allow any sub-origin (like chrome-extension://)
        return origin.startsWith(pattern)
      }
      return origin === pattern
    })
  }

  // Only set CORS header for allowed origins
  if (isAllowed && origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

/**
 * Handle OPTIONS preflight request - can be exported directly from API routes
 */
export function handleOptionsRequest(request?: NextRequest): NextResponse {
  return corsHeaders(new NextResponse(null, { status: 200 }), request)
}

/**
 * Get authenticated user from request headers
 * Convenience wrapper that extracts the Authorization header
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get('Authorization')
  return await getUserFromToken(authHeader)
}

/**
 * Require authentication - throws ApiError if user is not authenticated
 * Use this at the start of protected routes
 */
export async function requireAuth(request: NextRequest): Promise<User> {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    throw new ApiError('Unauthorized', 401, ErrorCodes.UNAUTHORIZED)
  }
  return user
}

