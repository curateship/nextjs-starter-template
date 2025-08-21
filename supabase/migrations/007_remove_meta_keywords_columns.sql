-- Remove meta_keywords columns from all tables
-- Meta keywords are no longer used for SEO and are deprecated

-- Remove meta_keywords from posts table
ALTER TABLE posts DROP COLUMN IF EXISTS meta_keywords;

-- Remove meta_keywords from products table  
ALTER TABLE products DROP COLUMN IF EXISTS meta_keywords;

-- Remove meta_keywords from pages table (if not already removed)
ALTER TABLE pages DROP COLUMN IF EXISTS meta_keywords;