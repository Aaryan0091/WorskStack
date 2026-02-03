-- Add added_by and created_at to collection_bookmarks for tracking
ALTER TABLE collection_bookmarks ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES auth.users(id);
ALTER TABLE collection_bookmarks ADD COLUMN IF NOT EXISTS bookmark_created_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS collection_bookmarks_added_by_idx ON collection_bookmarks(added_by);

-- Update existing records to point to collection owner
UPDATE collection_bookmarks cb
SET added_by = c.user_id
FROM collections c
WHERE cb.added_by IS NULL
AND cb.collection_id = c.id;
