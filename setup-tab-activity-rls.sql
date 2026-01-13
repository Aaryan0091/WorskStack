-- Fix RLS policies for tab_activity table
-- Run this in your Supabase SQL Editor

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own tab activity" ON tab_activity;
DROP POLICY IF EXISTS "Users can insert their own tab activity" ON tab_activity;

-- Create new policies
CREATE POLICY "Users can view their own tab activity"
  ON tab_activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tab activity"
  ON tab_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Verify policies
SELECT * FROM pg_policies WHERE tablename = 'tab_activity';
