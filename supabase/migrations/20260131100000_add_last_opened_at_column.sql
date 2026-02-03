-- Add last_opened_at column to track when bookmarks were last opened
-- This is used for the "Never Opened" feature in the reading list
ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

-- Add index for better query performance on filtering unopened items
CREATE INDEX IF NOT EXISTS idx_bookmarks_last_opened_at ON bookmarks(last_opened_at);
