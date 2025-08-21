-- Migration: Remove meta_keywords column from pages table
-- Date: 2025-08-21
-- Purpose: Clean up unused meta_keywords column - meta keywords are no longer used for SEO

-- Remove meta_keywords column from pages table
ALTER TABLE pages DROP COLUMN IF EXISTS meta_keywords;

-- Note: meta_description column is kept as it's still useful for SEO