-- Create table to track collection bookmarks users have removed from their view
-- This allows non-owners to "hide" bookmarks without deleting them for others
CREATE TABLE IF NOT EXISTS removed_collection_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, bookmark_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS removed_collection_bookmarks_user_id_idx ON removed_collection_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS removed_collection_bookmarks_collection_id_idx ON removed_collection_bookmarks(collection_id);
CREATE INDEX IF NOT EXISTS removed_collection_bookmarks_bookmark_id_idx ON removed_collection_bookmarks(bookmark_id);

-- Enable RLS
ALTER TABLE removed_collection_bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own removed bookmarks
CREATE POLICY "Users can view their own removed collection bookmarks"
ON removed_collection_bookmarks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own removed collection bookmarks"
ON removed_collection_bookmarks FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own removed collection bookmarks"
ON removed_collection_bookmarks FOR DELETE
USING (auth.uid() = user_id);
