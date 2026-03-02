-- ========================================
-- SIMPLIFY TAXONOMY SYSTEM TO CATEGORIES
-- ========================================
-- Removes the taxonomy_types layer entirely.
-- Renames taxonomies -> categories, content_taxonomy_relationships -> content_category_relationships
-- Keeps taxonomy-content as internal block type key to avoid JSONB data migration

-- ========================================
-- 1. HANDLE SLUG COLLISIONS ACROSS TYPES
-- ========================================
-- Before removing taxonomy_type_id, we need unique slugs per site.
-- Append the old type slug as suffix for any duplicates.
DO $$
DECLARE
  dup RECORD;
  type_slug TEXT;
BEGIN
  -- Find slugs that appear in more than one taxonomy_type for the same site
  FOR dup IN
    SELECT t.site_id, t.slug, COUNT(DISTINCT t.taxonomy_type_id) AS type_count
    FROM taxonomies t
    GROUP BY t.site_id, t.slug
    HAVING COUNT(DISTINCT t.taxonomy_type_id) > 1
  LOOP
    -- For each duplicate slug, update all but the first occurrence
    -- Keep the one with the lowest display_order (or earliest created) as-is
    FOR type_slug IN
      SELECT tt.slug AS type_slug
      FROM taxonomies tx
      JOIN taxonomy_types tt ON tt.id = tx.taxonomy_type_id
      WHERE tx.site_id = dup.site_id AND tx.slug = dup.slug
      ORDER BY tx.display_order ASC, tx.created_at ASC
      OFFSET 1  -- Skip the first one (keep it unchanged)
    LOOP
      UPDATE taxonomies
      SET slug = taxonomies.slug || '-' || type_slug
      FROM taxonomy_types tt
      WHERE taxonomies.taxonomy_type_id = tt.id
        AND tt.slug = type_slug
        AND taxonomies.site_id = dup.site_id
        AND taxonomies.slug = dup.slug;
    END LOOP;
  END LOOP;
END $$;

-- ========================================
-- 2. DROP taxonomy_type_id COLUMN
-- ========================================
-- Remove the FK constraint and column
ALTER TABLE taxonomies DROP CONSTRAINT IF EXISTS taxonomies_taxonomy_type_id_fkey;
DROP INDEX IF EXISTS idx_taxonomies_taxonomy_type_id;
DROP INDEX IF EXISTS idx_taxonomies_site_type_slug;
ALTER TABLE taxonomies DROP COLUMN IF EXISTS taxonomy_type_id;

-- ========================================
-- 3. RENAME TABLES
-- ========================================
ALTER TABLE taxonomies RENAME TO categories;
ALTER TABLE taxonomy_relationships RENAME TO content_category_relationships;

-- ========================================
-- 4. RENAME COLUMNS
-- ========================================
ALTER TABLE content_category_relationships RENAME COLUMN taxonomy_id TO category_id;

-- ========================================
-- 5. DROP taxonomy_types TABLE
-- ========================================
-- Drop trigger first
DROP TRIGGER IF EXISTS taxonomy_types_updated_at_trigger ON taxonomy_types;
DROP FUNCTION IF EXISTS update_taxonomy_types_updated_at();

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can view their own site taxonomy types" ON taxonomy_types;
DROP POLICY IF EXISTS "Users can create taxonomy types for their sites" ON taxonomy_types;
DROP POLICY IF EXISTS "Users can update their own site taxonomy types" ON taxonomy_types;
DROP POLICY IF EXISTS "Users can delete their own site taxonomy types" ON taxonomy_types;

DROP TABLE IF EXISTS taxonomy_types;

-- ========================================
-- 6. CREATE NEW UNIQUE INDEX ON categories
-- ========================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_site_slug ON categories(site_id, slug);

-- ========================================
-- 7. RENAME INDEXES
-- ========================================
-- Categories indexes
ALTER INDEX IF EXISTS idx_taxonomies_site_id RENAME TO idx_categories_site_id;
ALTER INDEX IF EXISTS idx_taxonomies_parent_id RENAME TO idx_categories_parent_id;
ALTER INDEX IF EXISTS idx_taxonomies_slug RENAME TO idx_categories_slug;
ALTER INDEX IF EXISTS idx_taxonomies_is_published RENAME TO idx_categories_is_published;
ALTER INDEX IF EXISTS idx_taxonomies_display_order RENAME TO idx_categories_display_order;

-- Content category relationships indexes
ALTER INDEX IF EXISTS idx_ctr_taxonomy_content RENAME TO idx_ccr_category_content;
ALTER INDEX IF EXISTS idx_ctr_content RENAME TO idx_ccr_content;
ALTER INDEX IF EXISTS idx_ctr_content_type RENAME TO idx_ccr_content_type;
ALTER INDEX IF EXISTS idx_ctr_taxonomy_id RENAME TO idx_ccr_category_id;
ALTER INDEX IF EXISTS idx_ctr_unique RENAME TO idx_ccr_unique;

-- ========================================
-- 8. RECREATE RLS POLICIES FOR RENAMED TABLES
-- ========================================

-- Drop old policies on categories (they were created for 'taxonomies' table)
DROP POLICY IF EXISTS "Users can view their own site taxonomies" ON categories;
DROP POLICY IF EXISTS "Users can create taxonomies for their sites" ON categories;
DROP POLICY IF EXISTS "Users can update their own site taxonomies" ON categories;
DROP POLICY IF EXISTS "Users can delete their own site taxonomies" ON categories;

-- Create new policies for categories
CREATE POLICY "Users can view their own site categories" ON categories
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = categories.site_id
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create categories for their sites" ON categories
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = categories.site_id
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own site categories" ON categories
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = categories.site_id
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own site categories" ON categories
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = categories.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Drop old policies on content_category_relationships
DROP POLICY IF EXISTS "Users can view their own content taxonomy relationships" ON content_category_relationships;
DROP POLICY IF EXISTS "Users can create content taxonomy relationships" ON content_category_relationships;
DROP POLICY IF EXISTS "Users can delete content taxonomy relationships" ON content_category_relationships;

-- Create new policies for content_category_relationships
CREATE POLICY "Users can view their own content category relationships" ON content_category_relationships
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM categories
            JOIN sites ON sites.id = categories.site_id
            WHERE categories.id = content_category_relationships.category_id
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create content category relationships" ON content_category_relationships
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM categories
            JOIN sites ON sites.id = categories.site_id
            WHERE categories.id = content_category_relationships.category_id
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete content category relationships" ON content_category_relationships
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM categories
            JOIN sites ON sites.id = categories.site_id
            WHERE categories.id = content_category_relationships.category_id
            AND sites.user_id = auth.uid()
        )
    );

-- ========================================
-- 9. UPDATE TRIGGERS
-- ========================================
-- Drop old trigger (was on 'taxonomies', now 'categories')
DROP TRIGGER IF EXISTS taxonomies_updated_at_trigger ON categories;
DROP FUNCTION IF EXISTS update_taxonomies_updated_at();

-- Create new trigger function
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER categories_updated_at_trigger
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_categories_updated_at();
