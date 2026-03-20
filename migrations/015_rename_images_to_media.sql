-- Create media table for media library (images and videos)

-- Step 1: Create media table (or rename from images if it exists)
DO $$
BEGIN
    -- Try to rename images table to media if it exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'images') THEN
        ALTER TABLE images RENAME TO media;
    ELSE
        -- Create media table if images table doesn't exist
        CREATE TABLE media (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            filename text NOT NULL,
            original_name text NOT NULL,
            alt_text text,
            file_size bigint NOT NULL,
            storage_path text NOT NULL,
            public_url text NOT NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        
        -- Enable RLS
        ALTER TABLE media ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Step 2: Add file_type column with default value (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'media' AND column_name = 'file_type') THEN
        ALTER TABLE media ADD COLUMN file_type text DEFAULT 'image' NOT NULL;
    END IF;
END $$;

-- Step 3: Update constraint check for file_type values
DO $$
BEGIN
    -- Drop constraint if it exists, then recreate it
    ALTER TABLE media DROP CONSTRAINT IF EXISTS media_file_type_check;
    ALTER TABLE media ADD CONSTRAINT media_file_type_check 
      CHECK (file_type IN ('image', 'video'));
END $$;

-- Step 4: Update indexes with new names
DROP INDEX IF EXISTS idx_images_user_id;
CREATE INDEX idx_media_user_id ON media(user_id);
CREATE INDEX idx_media_file_type ON media(file_type);

-- Step 5: Update RLS policies with new table names
-- Drop old policies
DROP POLICY IF EXISTS "Users can view own images" ON media;
DROP POLICY IF EXISTS "Users can insert own images" ON media;
DROP POLICY IF EXISTS "Users can update own images" ON media;
DROP POLICY IF EXISTS "Users can delete own images" ON media;

-- Create new policies with updated names
CREATE POLICY "Users can view own media" ON media
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media" ON media
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media" ON media
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own media" ON media
  FOR DELETE USING (auth.uid() = user_id);

-- Add comment to explain the file_type column
COMMENT ON COLUMN media.file_type IS 'Type of media file: image or video';