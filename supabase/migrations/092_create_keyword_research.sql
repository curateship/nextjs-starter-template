-- ========================================
-- KEYWORD RESEARCH SYSTEM
-- ========================================
-- Stores keyword research data per site, sourced from DataForSEO.
-- Keywords are scoped to sites and can be saved to a library.

-- ========================================
-- 1. KEYWORD RESEARCH TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS keyword_research (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    keyword VARCHAR(500) NOT NULL,
    search_volume INTEGER,
    keyword_difficulty INTEGER,
    cpc NUMERIC(10,2),
    competition NUMERIC(5,4),
    competition_level VARCHAR(20),
    search_intent VARCHAR(50),
    monthly_searches JSONB,
    is_saved BOOLEAN DEFAULT false,
    data_source VARCHAR(50) DEFAULT 'dataforseo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint: one keyword per site (upsert on conflict)
CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_research_site_keyword
    ON keyword_research(site_id, keyword);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_keyword_research_site_id
    ON keyword_research(site_id);
CREATE INDEX IF NOT EXISTS idx_keyword_research_is_saved
    ON keyword_research(site_id, is_saved);
CREATE INDEX IF NOT EXISTS idx_keyword_research_volume
    ON keyword_research(site_id, search_volume DESC);

-- ========================================
-- ROW LEVEL SECURITY
-- ========================================
ALTER TABLE keyword_research ENABLE ROW LEVEL SECURITY;

-- Users can view keywords for their own sites
CREATE POLICY "Users can view their own site keywords" ON keyword_research
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = keyword_research.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can create keywords for their own sites
CREATE POLICY "Users can create keywords for their sites" ON keyword_research
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = keyword_research.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can update keywords on their own sites
CREATE POLICY "Users can update their own site keywords" ON keyword_research
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = keyword_research.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can delete keywords from their own sites
CREATE POLICY "Users can delete their own site keywords" ON keyword_research
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = keyword_research.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- ========================================
-- TRIGGERS
-- ========================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_keyword_research_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER keyword_research_updated_at_trigger
    BEFORE UPDATE ON keyword_research
    FOR EACH ROW
    EXECUTE FUNCTION update_keyword_research_updated_at();
