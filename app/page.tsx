import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { DashboardContent } from './dashboard-content'

// Server component - fetches data server-side for fast initial render
async function getDashboardData() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { bookmarks: [], collections: [], user: null }
  }

  const [bookmarksRes, collectionsRes] = await Promise.all([
    supabase.from('bookmarks').select('*').limit(5),
    supabase.from('collections').select('*'),
  ])

  return {
    bookmarks: bookmarksRes.data || [],
    collections: collectionsRes.data || [],
    user: session.user,
  }
}

export default async function HomePage() {
  const data = await getDashboardData()

  // Redirect to login if not authenticated
  if (!data.user) {
    // Note: Middleware should handle this, but this is a fallback
    return null
  }

  return <DashboardContent initialBookmarks={data.bookmarks} initialCollections={data.collections} />
}
