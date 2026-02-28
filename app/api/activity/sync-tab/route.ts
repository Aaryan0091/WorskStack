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

// Sync tab API - ONE entry per tab per tracking session
// Uses tracking_session_id + tab_id to uniquely identify each tab's entry
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { url, title, domain, tracking_session_id, tab_id, is_new_entry, elapsed_seconds } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    if (!tracking_session_id || tab_id === undefined) {
      return NextResponse.json({ error: 'Missing tracking_session_id or tab_id' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Look for existing entry with same session_id + tab_id for authenticated user
    const { data: existingEntry, error: fetchError } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', user.id) // Use authenticated user's ID
      .eq('tracking_session_id', tracking_session_id)
      .eq('tab_id', String(tab_id))
      .maybeSingle()

    if (existingEntry) {
      // Entry exists - UPDATE it with new URL, title, and REPLACE duration
      // elapsed_seconds is the total time since tab was first seen, not an increment
      const newDuration = elapsed_seconds || 0

      const { error: updateError } = await supabase
        .from('tab_activity')
        .update({
          url: url,
          title: title || url,
          domain: domain || existingEntry.domain,
          duration_seconds: newDuration
        })
        .eq('id', existingEntry.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'updated',
        record_id: existingEntry.id,
        duration_seconds: newDuration
      })
    }

    // No existing entry - CREATE new one
    const { data: newEntry, error: insertError } = await supabase
      .from('tab_activity')
      .insert({
        user_id: user.id, // Use authenticated user's ID
        url,
        title: title || url,
        domain,
        duration_seconds: elapsed_seconds || 0,
        tracking_session_id,
        tab_id: String(tab_id),
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError || !newEntry) {
      return NextResponse.json({ error: insertError?.message || 'Insert failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      action: 'created',
      record_id: newEntry.id,
      duration_seconds: elapsed_seconds || 0
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
