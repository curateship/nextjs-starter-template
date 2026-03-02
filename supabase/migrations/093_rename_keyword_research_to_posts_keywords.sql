-- Rename keyword_research table to posts_keywords
ALTER TABLE keyword_research RENAME TO posts_keywords;

-- Rename indexes
ALTER INDEX idx_keyword_research_site_keyword RENAME TO idx_posts_keywords_site_keyword;
ALTER INDEX idx_keyword_research_site_id RENAME TO idx_posts_keywords_site_id;
ALTER INDEX idx_keyword_research_is_saved RENAME TO idx_posts_keywords_is_saved;
ALTER INDEX idx_keyword_research_volume RENAME TO idx_posts_keywords_volume;

-- Rename trigger and function
DROP TRIGGER IF EXISTS keyword_research_updated_at_trigger ON posts_keywords;

CREATE OR REPLACE FUNCTION update_posts_keywords_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_keywords_updated_at_trigger
    BEFORE UPDATE ON posts_keywords
    FOR EACH ROW
    EXECUTE FUNCTION update_posts_keywords_updated_at();

-- Clean up old function
DROP FUNCTION IF EXISTS update_keyword_research_updated_at();
