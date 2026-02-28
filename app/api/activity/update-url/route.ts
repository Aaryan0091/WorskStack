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

// URL update API - Simplified: update existing entry or create new one
// This preserves time across multiple tracking sessions
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { oldUrl, newUrl, newTitle, additionalDuration, tabId } = await request.json()

    if (!newUrl) {
      return NextResponse.json({ error: 'Missing newUrl parameter' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Use the provided title, or fall back to URL
    const titleToUse = (newTitle && newTitle.trim().length > 0) ? newTitle.trim() : newUrl

    // STEP 1: Look for an existing entry with this URL (from any previous session)
    // We want to ACCUMULATE time, not create duplicate entries
    const { data: existingEntry, error: fetchError } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', user.id) // Use authenticated user's ID
      .eq('url', newUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError && fetchError.code !== 'PGRST116') {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Update-URL API] Fetch error:', fetchError)
      }
    }

    if (existingEntry) {
      // Entry exists - UPDATE it (add time, update title)
      const newTotalTime = (existingEntry.duration_seconds || 0) + (additionalDuration || 0)

      const { error: updateError } = await supabase
        .from('tab_activity')
        .update({
          title: titleToUse,
          duration_seconds: newTotalTime,
          ended_at: new Date().toISOString()
        })
        .eq('id', existingEntry.id)

      if (updateError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Update-URL API] Update failed:', updateError)
        }
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'updated',
        record_id: existingEntry.id
      })
    }

    // STEP 2: No existing entry - CREATE new one
    const domain = extractDomain(newUrl)
    const { data: newEntry, error: insertError } = await supabase
      .from('tab_activity')
      .insert({
        user_id: user.id, // Use authenticated user's ID
        url: newUrl,
        title: titleToUse,
        domain,
        duration_seconds: additionalDuration || 0,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError || !newEntry) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Update-URL API] Insert error:', insertError)
      }
      return NextResponse.json({ error: insertError?.message || 'Insert failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      action: 'created',
      record_id: newEntry.id
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Update-URL API] API error:', error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to extract domain from URL
function extractDomain(url: string) {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return url
  }
}
