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

// Upsert API - Update existing entry or create new one
// This accumulates time across multiple tracking sessions
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { url, title, domain, duration_seconds = 0 } = body

    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Look for existing entry with this URL
    const { data: existingEntry, error: fetchError } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', user.id) // Use authenticated user's ID
      .eq('url', url)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[Upsert API] Fetch error:', fetchError)
    }

    const titleToUse = (title && title.trim().length > 0) ? title.trim() : url

    if (existingEntry) {
      // Entry exists - UPDATE it (add time, update title if provided)
      const newTotalTime = (existingEntry.duration_seconds || 0) + duration_seconds

      const { error: updateError } = await supabase
        .from('tab_activity')
        .update({
          title: titleToUse,
          domain: domain || existingEntry.domain,
          duration_seconds: newTotalTime,
          ended_at: new Date().toISOString()
        })
        .eq('id', existingEntry.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'updated',
        record_id: existingEntry.id
      })
    }

    // No existing entry - CREATE new one
    const { data: newEntry, error: insertError } = await supabase
      .from('tab_activity')
      .insert({
        user_id: user.id, // Use authenticated user's ID
        url,
        title: titleToUse,
        domain,
        duration_seconds,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError || !newEntry) {
      return NextResponse.json({ error: insertError?.message || 'Insert failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      action: 'inserted',
      record_id: newEntry.id
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
