import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import type { Bookmark, Collection } from '@/lib/types'
import { SharedCollectionClient } from './shared-collection-client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface SharedCollectionPageProps {
  params: { slug: string }
}

async function getSharedCollection(slug: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data: collection, error } = await supabase
    .from('collections')
    .select('*')
    .eq('share_slug', slug)
    .eq('is_public', true)
    .single()

  if (error || !collection) {
    return null
  }

  // Get bookmarks in this collection via junction table
  const { data: collectionBookmarks } = await supabase
    .from('collection_bookmarks')
    .select('bookmark_id')
    .eq('collection_id', collection.id)

  const bookmarkIds = collectionBookmarks?.map((cb: { bookmark_id: string }) => cb.bookmark_id) || []

  let bookmarks: Bookmark[] = []
  if (bookmarkIds.length > 0) {
    const { data: bookmarksData } = await supabase
      .from('bookmarks')
      .select('*')
      .in('id', bookmarkIds)
      .order('created_at', { ascending: false })

    bookmarks = bookmarksData || []
  }

  return { collection, bookmarks }
}

export async function generateMetadata({ params }: SharedCollectionPageProps) {
  const data = await getSharedCollection(params.slug)

  if (!data) {
    return {
      title: 'Collection Not Found - WorkStack'
    }
  }

  const { collection } = data

  return {
    title: `${collection.name} - Shared Collection`,
    description: collection.description || `View ${collection.name} shared collection on WorkStack`
  }
}

export default async function SharedCollectionPage({ params }: SharedCollectionPageProps) {
  const data = await getSharedCollection(params.slug)

  if (!data) {
    notFound()
  }

  return <SharedCollectionClient collection={data.collection} bookmarks={data.bookmarks} />
}
