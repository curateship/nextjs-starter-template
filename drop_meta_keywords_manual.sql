-- MANUAL MIGRATION: Run this in Supabase SQL Editor
-- This drops the meta_keywords column as it's obsolete for SEO

-- First, let's see what we're working with
SELECT id, title, meta_keywords FROM products LIMIT 5;

-- Drop the meta_keywords column
ALTER TABLE products DROP COLUMN IF EXISTS meta_keywords;

-- Verify column is dropped
SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'meta_keywords';

-- Should return no rows if successful