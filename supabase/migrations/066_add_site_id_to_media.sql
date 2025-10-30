-- Add site_id to media table for site-scoped media library

-- Step 1: Add site_id column (nullable initially)
ALTER TABLE media ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

-- Step 2: Create index for efficient site-scoped queries
CREATE INDEX IF NOT EXISTS idx_media_site_id ON media(site_id);
CREATE INDEX IF NOT EXISTS idx_media_user_site ON media(user_id, site_id);

-- Step 3: Update RLS policies to include site_id filtering
-- Drop old policies
DROP POLICY IF EXISTS "Users can view own media" ON media;
DROP POLICY IF EXISTS "Users can insert own media" ON media;
DROP POLICY IF EXISTS "Users can update own media" ON media;
DROP POLICY IF EXISTS "Users can delete own media" ON media;

-- Create new policies with site_id awareness
-- Users can view media from their own sites
CREATE POLICY "Users can view own media" ON media
  FOR SELECT USING (
    auth.uid() = user_id AND
    (site_id IS NULL OR site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()))
  );

-- Users can insert media with their own user_id and valid site_id
CREATE POLICY "Users can insert own media" ON media
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    (site_id IS NULL OR site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()))
  );

-- Users can update their own media
CREATE POLICY "Users can update own media" ON media
  FOR UPDATE USING (
    auth.uid() = user_id AND
    (site_id IS NULL OR site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()))
  );

-- Users can delete their own media
CREATE POLICY "Users can delete own media" ON media
  FOR DELETE USING (
    auth.uid() = user_id AND
    (site_id IS NULL OR site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()))
  );

-- Add comment to explain the site_id column
COMMENT ON COLUMN media.site_id IS 'Optional site association for site-scoped media. NULL means media is user-scoped (legacy).';
