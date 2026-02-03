-- Create junction table for many-to-many relationship between collections and bookmarks
CREATE TABLE IF NOT EXISTS collection_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, bookmark_id)
);

-- Enable Realtime for collection_bookmarks (skip if already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'collection_bookmarks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE collection_bookmarks;
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS collection_bookmarks_collection_id_idx ON collection_bookmarks(collection_id);
CREATE INDEX IF NOT EXISTS collection_bookmarks_bookmark_id_idx ON collection_bookmarks(bookmark_id);

-- Migrate existing collection_id from bookmarks table
INSERT INTO collection_bookmarks (collection_id, bookmark_id)
SELECT collection_id, id
FROM bookmarks
WHERE collection_id IS NOT NULL
ON CONFLICT (collection_id, bookmark_id) DO NOTHING;