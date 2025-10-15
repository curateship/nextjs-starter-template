-- ========================================
-- TAXONOMY SYSTEM - Universal content tagging
-- ========================================
-- Supports hierarchical taxonomies (Location, Business Category, etc.)
-- that can be attached to any content type (directories, products, posts, events)

-- ========================================
-- 1. TAXONOMY TYPES TABLE
-- ========================================
-- Stores the different types of taxonomies (Location, Business, Features, etc.)
CREATE TABLE IF NOT EXISTS taxonomy_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    is_hierarchical BOOLEAN DEFAULT true, -- Supports parent/child relationships
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for taxonomy_types
CREATE INDEX IF NOT EXISTS idx_taxonomy_types_site_id ON taxonomy_types(site_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_types_slug ON taxonomy_types(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomy_types_site_slug ON taxonomy_types(site_id, slug);

-- ========================================
-- 2. TAXONOMIES TABLE
-- ========================================
-- Stores individual taxonomy terms (Canada, Toronto, Dental, etc.)
-- Each term has FULL BUILDER SUPPORT like products/posts
CREATE TABLE IF NOT EXISTS taxonomies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    taxonomy_type_id UUID NOT NULL REFERENCES taxonomy_types(id) ON DELETE CASCADE,

    -- Basic info
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,

    -- Hierarchy support (Toronto points to Canada)
    parent_id UUID REFERENCES taxonomies(id) ON DELETE SET NULL,

    -- Full content builder support (like products)
    featured_image TEXT,
    description TEXT,
    meta_description TEXT,
    content_blocks JSONB DEFAULT '{}',

    -- Publishing
    is_published BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for taxonomies
CREATE INDEX IF NOT EXISTS idx_taxonomies_site_id ON taxonomies(site_id);
CREATE INDEX IF NOT EXISTS idx_taxonomies_taxonomy_type_id ON taxonomies(taxonomy_type_id);
CREATE INDEX IF NOT EXISTS idx_taxonomies_parent_id ON taxonomies(parent_id);
CREATE INDEX IF NOT EXISTS idx_taxonomies_slug ON taxonomies(slug);
CREATE INDEX IF NOT EXISTS idx_taxonomies_is_published ON taxonomies(is_published);
CREATE INDEX IF NOT EXISTS idx_taxonomies_display_order ON taxonomies(display_order);

-- Unique constraint: slug must be unique per site and taxonomy type
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomies_site_type_slug
    ON taxonomies(site_id, taxonomy_type_id, slug);

-- ========================================
-- 3. CONTENT TAXONOMY RELATIONSHIPS TABLE
-- ========================================
-- Universal polymorphic table connecting ANY content type to taxonomies
-- Supports: directories, products, posts, events, pages
CREATE TABLE IF NOT EXISTS content_taxonomy_relationships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- The content being tagged
    content_id UUID NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- 'directory', 'product', 'post', 'event', 'page'

    -- The taxonomy term
    taxonomy_id UUID NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for content_taxonomy_relationships
-- These indexes are CRITICAL for performance
CREATE INDEX IF NOT EXISTS idx_ctr_taxonomy_content
    ON content_taxonomy_relationships(taxonomy_id, content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_ctr_content
    ON content_taxonomy_relationships(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_ctr_content_type
    ON content_taxonomy_relationships(content_type);
CREATE INDEX IF NOT EXISTS idx_ctr_taxonomy_id
    ON content_taxonomy_relationships(taxonomy_id);

-- Prevent duplicate relationships
CREATE UNIQUE INDEX IF NOT EXISTS idx_ctr_unique
    ON content_taxonomy_relationships(content_id, taxonomy_id, content_type);

-- ========================================
-- ROW LEVEL SECURITY
-- ========================================

-- Enable RLS on all tables
ALTER TABLE taxonomy_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomies ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_taxonomy_relationships ENABLE ROW LEVEL SECURITY;

-- ========================================
-- RLS POLICIES: taxonomy_types
-- ========================================

-- Users can view taxonomy types from their own sites
CREATE POLICY "Users can view their own site taxonomy types" ON taxonomy_types
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomy_types.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can create taxonomy types for their own sites
CREATE POLICY "Users can create taxonomy types for their sites" ON taxonomy_types
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomy_types.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can update taxonomy types on their own sites
CREATE POLICY "Users can update their own site taxonomy types" ON taxonomy_types
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomy_types.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can delete taxonomy types from their own sites
CREATE POLICY "Users can delete their own site taxonomy types" ON taxonomy_types
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomy_types.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- ========================================
-- RLS POLICIES: taxonomies
-- ========================================

-- Users can view taxonomies from their own sites
CREATE POLICY "Users can view their own site taxonomies" ON taxonomies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomies.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can create taxonomies for their own sites
CREATE POLICY "Users can create taxonomies for their sites" ON taxonomies
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomies.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can update taxonomies on their own sites
CREATE POLICY "Users can update their own site taxonomies" ON taxonomies
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomies.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can delete taxonomies from their own sites
CREATE POLICY "Users can delete their own site taxonomies" ON taxonomies
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = taxonomies.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- ========================================
-- RLS POLICIES: content_taxonomy_relationships
-- ========================================

-- Users can view relationships for content from their own sites
CREATE POLICY "Users can view their own content taxonomy relationships" ON content_taxonomy_relationships
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM taxonomies
            JOIN sites ON sites.id = taxonomies.site_id
            WHERE taxonomies.id = content_taxonomy_relationships.taxonomy_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can create relationships for content from their own sites
CREATE POLICY "Users can create content taxonomy relationships" ON content_taxonomy_relationships
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM taxonomies
            JOIN sites ON sites.id = taxonomies.site_id
            WHERE taxonomies.id = content_taxonomy_relationships.taxonomy_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can delete relationships for content from their own sites
CREATE POLICY "Users can delete content taxonomy relationships" ON content_taxonomy_relationships
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM taxonomies
            JOIN sites ON sites.id = taxonomies.site_id
            WHERE taxonomies.id = content_taxonomy_relationships.taxonomy_id
            AND sites.user_id = auth.uid()
        )
    );

-- ========================================
-- TRIGGERS
-- ========================================

-- Auto-update updated_at timestamp for taxonomy_types
CREATE OR REPLACE FUNCTION update_taxonomy_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER taxonomy_types_updated_at_trigger
    BEFORE UPDATE ON taxonomy_types
    FOR EACH ROW
    EXECUTE FUNCTION update_taxonomy_types_updated_at();

-- Auto-update updated_at timestamp for taxonomies
CREATE OR REPLACE FUNCTION update_taxonomies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER taxonomies_updated_at_trigger
    BEFORE UPDATE ON taxonomies
    FOR EACH ROW
    EXECUTE FUNCTION update_taxonomies_updated_at();
