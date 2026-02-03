-- Drop old policies
DROP POLICY IF EXISTS "Users can view bookmarks from accessible collections" ON collection_bookmarks;
DROP POLICY IF EXISTS "Only owners and editors can add bookmarks" ON collection_bookmarks;
DROP POLICY IF EXISTS "Only owners and editors can remove bookmarks" ON collection_bookmarks;

-- VIEW policy: Complex logic for private vs public collections
CREATE POLICY "Users can view bookmarks based on collection visibility"
ON collection_bookmarks FOR SELECT
USING (
  -- Always see your own additions
  added_by = auth.uid()
  OR
  -- Owner sees everything in their collections
  EXISTS (
    SELECT 1 FROM collections
    WHERE collections.id = collection_bookmarks.collection_id
    AND collections.user_id = auth.uid()
  )
  OR
  -- For public collections: see all bookmarks
  EXISTS (
    SELECT 1 FROM collections
    WHERE collections.id = collection_bookmarks.collection_id
    AND collections.is_public = true
    AND EXISTS (
      SELECT 1 FROM shared_collections
      WHERE shared_collections.collection_id = collections.id
      AND shared_collections.user_id = auth.uid()
    )
  )
  OR
  -- For private collections: only see owner's original bookmarks (added_by = owner)
  EXISTS (
    SELECT 1 FROM collections c
    JOIN shared_collections sc ON sc.collection_id = c.id
    WHERE c.id = collection_bookmarks.collection_id
    AND c.is_public = false
    AND sc.user_id = auth.uid()
    AND collection_bookmarks.added_by = c.user_id
  )
);

-- INSERT policy: Users can add bookmarks, but they're tagged with their user_id
CREATE POLICY "Users can add bookmarks to shared collections"
ON collection_bookmarks FOR INSERT
WITH CHECK (
  -- User owns the collection
  EXISTS (
    SELECT 1 FROM collections
    WHERE collections.id = collection_bookmarks.collection_id
    AND collections.user_id = auth.uid()
  )
  OR
  -- User has access (editor for public, viewer for private)
  EXISTS (
    SELECT 1 FROM shared_collections
    WHERE shared_collections.collection_id = collection_bookmarks.collection_id
    AND shared_collections.user_id = auth.uid()
  )
);

-- Ensure added_by is set to current user on insert
CREATE OR REPLACE FUNCTION set_added_by_for_collection_bookmarks()
RETURNS TRIGGER AS $$
BEGIN
  NEW.added_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_insert_collection_bookmarks ON collection_bookmarks;
CREATE TRIGGER on_insert_collection_bookmarks
  BEFORE INSERT ON collection_bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION set_added_by_for_collection_bookmarks();

-- DELETE policy: Users can only remove bookmarks they added (unless they're the owner)
CREATE POLICY "Users can delete their own bookmarks from shared collections"
ON collection_bookmarks FOR DELETE
USING (
  added_by = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM collections
    WHERE collections.id = collection_bookmarks.collection_id
    AND collections.user_id = auth.uid()
  )
);
