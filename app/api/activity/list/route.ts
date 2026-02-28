import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required Supabase environment variables')
}

const SUPABASE_URL: string = supabaseUrl
const SUPABASE_ANON_KEY: string = supabaseAnonKey
const SUPABASE_SERVICE_KEY = supabaseServiceKey || supabaseAnonKey

// Helper: Get authenticated user from request
async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return null
  }

  return data.user
}

// Get activity list - all sessions, latest entry per tab per session
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Get all entries for authenticated user, ordered by ended_at descending
    // This allows client-side filtering by time period (today/week/month/all)
    const { data, error } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', user.id) // Use authenticated user's ID, not from request body
      .order('ended_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter to get only the latest entry per (session, tab) pair
    // This ensures that if user navigated within a tab during a session,
    // only the final URL for that tab is counted
    const seen = new Set<string>()
    const filtered = (data || []).filter(item => {
      // Use combination of tracking_session_id and tab_id as the key
      const key = `${item.tracking_session_id}_${item.tab_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json({ success: true, data: filtered })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
