-- Create table to track collections users have removed from their view
-- This allows users to "leave" a collection without deleting it for others
CREATE TABLE IF NOT EXISTS removed_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS removed_collections_user_id_idx ON removed_collections(user_id);
CREATE INDEX IF NOT EXISTS removed_collections_collection_id_idx ON removed_collections(collection_id);

-- Enable RLS
ALTER TABLE removed_collections ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own removed collections
CREATE POLICY "Users can view their own removed collections"
ON removed_collections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own removed collections"
ON removed_collections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own removed collections"
ON removed_collections FOR DELETE
USING (auth.uid() = user_id);
