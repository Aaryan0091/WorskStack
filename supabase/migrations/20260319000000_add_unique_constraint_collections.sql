-- Add unique constraint to prevent duplicate collection names for the same user
-- This fixes the issue where multiple default collections can be created due to race conditions
CREATE UNIQUE INDEX IF NOT EXISTS collections_user_name_idx ON collections(user_id, LOWER(name));

-- Note: If you have existing duplicate collections, you may need to manually remove them
-- before this migration will succeed. You can identify duplicates with:
-- SELECT user_id, name, COUNT(*) FROM collections GROUP BY user_id, name HAVING COUNT(*) > 1;
