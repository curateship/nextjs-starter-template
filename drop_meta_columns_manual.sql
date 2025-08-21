-- MANUAL MIGRATION: Run this in Supabase SQL Editor
-- This drops both meta_keywords and meta_description columns as they're obsolete
-- We'll use the product description from content_blocks for SEO if needed

-- First, check which columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('meta_keywords', 'meta_description');

-- Drop the meta_keywords column if it exists
ALTER TABLE products DROP COLUMN IF EXISTS meta_keywords;

-- Drop the meta_description column if it exists
ALTER TABLE products DROP COLUMN IF EXISTS meta_description;

-- Verify columns are dropped
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('meta_keywords', 'meta_description');

-- Should return no rows if successful

-- Check the final structure
SELECT id, title, slug, is_published, content_blocks FROM products LIMIT 5;