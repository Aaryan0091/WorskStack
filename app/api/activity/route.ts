import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

interface Activity {
  user_id: string
  url: string
  title?: string
  domain?: string
  duration_seconds?: number
  started_at?: string
  ended_at?: string
}

interface TabActivity {
  id: string
  user_id: string
  url: string
  title?: string
  domain?: string
  duration_seconds?: number
  started_at: string
  ended_at: string
}

// POST - Insert activities (legacy, for batch sync)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { activities } = body

    if (!activities || !Array.isArray(activities)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    const { data, error } = await supabase
      .from('tab_activity')
      .insert(activities.map((a: Activity) => ({
        user_id: a.user_id,
        url: a.url,
        title: a.title,
        domain: a.domain,
        duration_seconds: a.duration_seconds,
        started_at: a.started_at,
        ended_at: a.ended_at,
      })))
      .select()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: activities.length, data })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { domain, user_id } = body

    if (!domain || !user_id) {
      return NextResponse.json({ error: 'Missing domain or user_id' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    const { error } = await supabase
      .from('tab_activity')
      .delete()
      .eq('user_id', user_id)
      .eq('domain', domain)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', today.toISOString())
      .order('started_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const activities = data as TabActivity[] | null
    const totalTabs = activities?.length || 0
    const totalSeconds = activities?.reduce((sum, item) => sum + (item.duration_seconds || 0), 0) || 0

    const domainStats: Record<string, { count: number; seconds: number }> = {}
    activities?.forEach((item: TabActivity) => {
      const domain = item.domain || 'other'
      if (!domainStats[domain]) {
        domainStats[domain] = { count: 0, seconds: 0 }
      }
      domainStats[domain].count++
      domainStats[domain].seconds += item.duration_seconds || 0
    })

    return NextResponse.json({
      activities: activities || [],
      summary: {
        totalTabs,
        totalSeconds,
        domainStats
      }
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Upsert a tab (insert or update if exists)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, url, title, domain, started_at } = body

    if (!user_id || !url) {
      return NextResponse.json({ error: 'Missing user_id or url' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // First, check if an entry with this URL already exists for this user
    const { data: existing } = await supabase
      .from('tab_activity')
      .select('*')
      .eq('user_id', user_id)
      .eq('url', url)
      .maybeSingle()

    if (existing) {
      // Update the existing entry (refresh the timestamp)
      const { error: updateError } = await supabase
        .from('tab_activity')
        .update({
          title,
          domain,
          started_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, action: 'updated' })
    } else {
      // Insert new entry
      const { error: insertError } = await supabase
        .from('tab_activity')
        .insert({
          user_id,
          url,
          title,
          domain,
          duration_seconds: 0,
          started_at,
          ended_at: started_at
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, action: 'inserted' })
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
