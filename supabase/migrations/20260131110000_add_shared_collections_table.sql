-- Table to track which users have access to which collections
-- role can be 'owner' (full edit), 'editor' (full edit for public collections), 'viewer' (read-only)
CREATE TABLE IF NOT EXISTS shared_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS shared_collections_collection_id_idx ON shared_collections(collection_id);
CREATE INDEX IF NOT EXISTS shared_collections_user_id_idx ON shared_collections(user_id);

-- Add a unique code for easy sharing (separate from share_slug)
ALTER TABLE collections ADD COLUMN IF NOT EXISTS share_code TEXT UNIQUE;

-- Generate share codes for existing collections
DO $$
DECLARE
  collection_record RECORD;
  new_code TEXT;
BEGIN
  FOR collection_record IN SELECT id FROM collections WHERE share_code IS NULL LOOP
    new_code := lower(substr(encode(gen_random_bytes(16), 'hex'), 1, 8));
    UPDATE collections SET share_code = new_code WHERE id = collection_record.id;
  END LOOP;
END $$;

-- Migrate existing collection owners to shared_collections
INSERT INTO shared_collections (collection_id, user_id, role)
SELECT id, user_id, 'owner' FROM collections
ON CONFLICT (collection_id, user_id) DO NOTHING;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE shared_collections;
