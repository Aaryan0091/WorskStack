import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

// Validate required environment variables
function validateEnvVars() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
  }

  return { url, key }
}

// Client-side Supabase client that uses cookies (syncs with middleware)
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const { url, key } = validateEnvVars()

    if (typeof window !== 'undefined') {
      // Browser client
      supabaseInstance = createBrowserClient(url, key)
    } else {
      // Server client
      supabaseInstance = createClient(url, key)
    }
  }
  return supabaseInstance
}

// Lazy initialization - only create client when actually used
export const supabase = getSupabaseClient()
