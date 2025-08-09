-- Create image system with storage and usage tracking
-- Migration: 011_create_image_system

-- Create images table for storing image metadata
CREATE TABLE images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL, -- Generated filename in storage
  original_name text NOT NULL, -- Original uploaded filename
  alt_text text, -- Alt text for accessibility
  file_size bigint NOT NULL, -- File size in bytes
  mime_type text NOT NULL, -- image/jpeg, image/png, etc.
  width integer, -- Image width in pixels
  height integer, -- Image height in pixels
  storage_path text NOT NULL, -- Full path in Supabase Storage
  public_url text NOT NULL, -- Public CDN URL
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create image_usage table for tracking where images are used
CREATE TABLE image_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  block_type text NOT NULL, -- 'navigation', 'hero', 'footer', etc.
  usage_context text NOT NULL, -- 'logo', 'hero_background', 'content_image'
  created_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate usage entries
  UNIQUE(image_id, site_id, block_type, usage_context)
);

-- Create indexes for performance
CREATE INDEX idx_images_user_id ON images(user_id);
CREATE INDEX idx_images_created_at ON images(created_at DESC);
CREATE INDEX idx_image_usage_image_id ON image_usage(image_id);
CREATE INDEX idx_image_usage_site_id ON image_usage(site_id);

-- Add RLS policies for images
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Users can only access their own images
CREATE POLICY "Users can view own images" ON images
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own images" ON images
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own images" ON images
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own images" ON images
  FOR DELETE USING (auth.uid() = user_id);

-- Add RLS policies for image_usage
ALTER TABLE image_usage ENABLE ROW LEVEL SECURITY;

-- Users can only manage usage for their own images and sites
CREATE POLICY "Users can view image usage for own images" ON image_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM images 
      WHERE images.id = image_usage.image_id 
      AND images.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert image usage for own images" ON image_usage
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM images 
      WHERE images.id = image_usage.image_id 
      AND images.user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = image_usage.site_id 
      AND sites.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update image usage for own images" ON image_usage
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM images 
      WHERE images.id = image_usage.image_id 
      AND images.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete image usage for own images" ON image_usage
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM images 
      WHERE images.id = image_usage.image_id 
      AND images.user_id = auth.uid()
    )
  );

-- Create function to update image updated_at timestamp
CREATE OR REPLACE FUNCTION update_image_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_images_updated_at
  BEFORE UPDATE ON images
  FOR EACH ROW
  EXECUTE FUNCTION update_image_updated_at();

-- Create view for images with usage statistics
CREATE OR REPLACE VIEW image_details AS
SELECT 
  i.*,
  COALESCE(usage_stats.usage_count, 0) as usage_count,
  COALESCE(usage_stats.sites_using, 0) as sites_using
FROM images i
LEFT JOIN (
  SELECT 
    image_id,
    COUNT(*) as usage_count,
    COUNT(DISTINCT site_id) as sites_using
  FROM image_usage
  GROUP BY image_id
) usage_stats ON i.id = usage_stats.image_id;

-- Grant access to the view
GRANT SELECT ON image_details TO authenticated;