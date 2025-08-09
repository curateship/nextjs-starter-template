-- Setup Supabase Storage bucket for images
-- Migration: 012_setup_storage_bucket

-- Create storage bucket for site images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-images',
  'site-images',
  true, -- Public bucket for CDN access
  10485760, -- 10MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
);

-- Create storage policies for the bucket
CREATE POLICY "Users can view own images" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own images" ON storage.objects
  FOR DELETE USING (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create helper function to generate storage path
CREATE OR REPLACE FUNCTION generate_image_storage_path(user_uuid uuid, original_filename text)
RETURNS text AS $$
DECLARE
  file_extension text;
  clean_filename text;
  timestamp_str text;
BEGIN
  -- Extract file extension
  file_extension := lower(right(original_filename, 4));
  IF NOT (file_extension LIKE '.%') THEN
    file_extension := '';
  END IF;
  
  -- Clean filename (remove extension and special chars)
  clean_filename := regexp_replace(
    left(original_filename, length(original_filename) - length(file_extension)),
    '[^a-zA-Z0-9.-]',
    '-',
    'g'
  );
  
  -- Generate timestamp
  timestamp_str := extract(epoch from now())::bigint::text;
  
  -- Return full path: user_id/timestamp_filename.ext
  RETURN user_uuid::text || '/' || timestamp_str || '_' || clean_filename || file_extension;
END;
$$ language plpgsql;

-- Create function to get public URL for storage path
CREATE OR REPLACE FUNCTION get_image_public_url(storage_path text)
RETURNS text AS $$
BEGIN
  RETURN 'https://' || current_setting('app.settings.supabase_url', true) || '/storage/v1/object/public/site-images/' || storage_path;
END;
$$ language plpgsql;

COMMENT ON FUNCTION generate_image_storage_path IS 'Generates a secure storage path for uploaded images with timestamp prefix';
COMMENT ON FUNCTION get_image_public_url IS 'Returns the public CDN URL for a storage path';