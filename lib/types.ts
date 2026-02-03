export interface Bookmark {
  id: string
  user_id: string
  url: string
  title: string
  description: string | null
  notes: string | null
  is_read: boolean
  is_favorite: boolean
  folder_id: string | null
  collection_id: string | null
  favicon_url: string | null
  screenshot_url: string | null
  last_opened_at: string | null
  created_at: string
  updated_at: string
}

export interface Folder {
  id: string
  user_id: string
  name: string
  icon: string
  created_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface Collection {
  id: string
  user_id: string
  name: string
  description: string | null
  is_public: boolean
  share_slug: string | null
  share_code: string | null
  created_at: string
}

// Role of a user for a shared collection
export type CollectionRole = 'owner' | 'editor' | 'viewer'

export interface SharedCollection {
  id: string
  collection_id: string
  user_id: string
  role: CollectionRole
  created_at: string
}

export interface BookmarkTask {
  id: string
  user_id: string
  bookmark_id: string | null
  title: string
  completed: boolean
  due_date: string | null
  created_at: string
}

export interface TabActivity {
  id: string
  user_id: string
  url: string
  title: string | null
  domain: string | null
  duration_seconds: number
  started_at: string
  ended_at: string | null
  created_at: string
}
