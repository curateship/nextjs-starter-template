-- Fix this mess - migrate data from files to media table, then delete files table
-- Copy all data from files table to media table if media table exists and files table exists
INSERT INTO media (user_id, filename, original_name, alt_text, file_size, storage_path, public_url, created_at, updated_at)
SELECT user_id, filename, original_name, alt_text, file_size, storage_path, public_url, created_at, updated_at 
FROM files
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'files')
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'media')
ON CONFLICT DO NOTHING;

-- Add file_type column if it doesn't exist, defaulting existing records to 'image'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'media' AND column_name = 'file_type') THEN
        ALTER TABLE media ADD COLUMN file_type text DEFAULT 'image' CHECK (file_type IN ('image', 'video'));
        UPDATE media SET file_type = 'image' WHERE file_type IS NULL;
        ALTER TABLE media ALTER COLUMN file_type SET NOT NULL;
    END IF;
END $$;

-- Delete the files table now that data is in media table
DROP TABLE IF EXISTS files;