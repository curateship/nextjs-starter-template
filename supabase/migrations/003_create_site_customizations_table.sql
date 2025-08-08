-- Create site_customizations table for storing block-level customizations
-- This table stores all customizations made to blocks within sites

CREATE TABLE IF NOT EXISTS site_customizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    page_path VARCHAR(255) NOT NULL DEFAULT '/', -- e.g., '/', '/about', '/contact'
    block_type VARCHAR(100) NOT NULL, -- e.g., 'HeroRuixenBlock', 'ProductGridBlock'
    block_identifier VARCHAR(100) NOT NULL, -- unique identifier within the page
    customizations JSONB NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_site_customizations_site_id ON site_customizations(site_id);
CREATE INDEX IF NOT EXISTS idx_site_customizations_page_path ON site_customizations(page_path);
CREATE INDEX IF NOT EXISTS idx_site_customizations_block_type ON site_customizations(block_type);
CREATE INDEX IF NOT EXISTS idx_site_customizations_active ON site_customizations(is_active) WHERE is_active = true;

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_site_customizations_site_page ON site_customizations(site_id, page_path);
CREATE INDEX IF NOT EXISTS idx_site_customizations_site_page_active ON site_customizations(site_id, page_path, is_active) WHERE is_active = true;

-- Create unique constraint to prevent duplicate active customizations for the same block
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_customizations_unique_active 
ON site_customizations(site_id, page_path, block_type, block_identifier) 
WHERE is_active = true;

-- Create updated_at trigger for automatic timestamp updates
CREATE TRIGGER update_site_customizations_updated_at BEFORE UPDATE ON site_customizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to get active customizations for a site page
CREATE OR REPLACE FUNCTION get_site_page_customizations(
    p_site_id UUID,
    p_page_path VARCHAR(255) DEFAULT '/'
)
RETURNS TABLE (
    block_type VARCHAR(100),
    block_identifier VARCHAR(100),
    customizations JSONB,
    version INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sc.block_type,
        sc.block_identifier,
        sc.customizations,
        sc.version,
        sc.updated_at
    FROM site_customizations sc
    WHERE sc.site_id = p_site_id 
        AND sc.page_path = p_page_path 
        AND sc.is_active = true
    ORDER BY sc.block_type, sc.block_identifier;
END;
$$ LANGUAGE plpgsql;

-- Create function to save block customization (handles versioning)
CREATE OR REPLACE FUNCTION save_block_customization(
    p_site_id UUID,
    p_page_path VARCHAR(255),
    p_block_type VARCHAR(100),
    p_block_identifier VARCHAR(100),
    p_customizations JSONB
)
RETURNS UUID AS $$
DECLARE
    v_customization_id UUID;
    v_current_version INTEGER := 1;
BEGIN
    -- Get current version if exists
    SELECT version INTO v_current_version
    FROM site_customizations
    WHERE site_id = p_site_id 
        AND page_path = p_page_path
        AND block_type = p_block_type
        AND block_identifier = p_block_identifier
        AND is_active = true;
    
    -- If found, increment version and deactivate old record
    IF v_current_version IS NOT NULL THEN
        v_current_version := v_current_version + 1;
        
        -- Deactivate current active customization
        UPDATE site_customizations 
        SET is_active = false, updated_at = NOW()
        WHERE site_id = p_site_id 
            AND page_path = p_page_path
            AND block_type = p_block_type
            AND block_identifier = p_block_identifier
            AND is_active = true;
    END IF;
    
    -- Insert new customization record
    INSERT INTO site_customizations (
        site_id, page_path, block_type, block_identifier, 
        customizations, version, is_active
    ) VALUES (
        p_site_id, p_page_path, p_block_type, p_block_identifier,
        p_customizations, v_current_version, true
    ) RETURNING id INTO v_customization_id;
    
    RETURN v_customization_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to rollback to previous version
CREATE OR REPLACE FUNCTION rollback_block_customization(
    p_site_id UUID,
    p_page_path VARCHAR(255),
    p_block_type VARCHAR(100),
    p_block_identifier VARCHAR(100),
    p_target_version INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_target_customization RECORD;
BEGIN
    -- If no target version specified, get the previous version
    IF p_target_version IS NULL THEN
        SELECT version INTO p_target_version
        FROM site_customizations
        WHERE site_id = p_site_id 
            AND page_path = p_page_path
            AND block_type = p_block_type
            AND block_identifier = p_block_identifier
            AND is_active = true;
        
        p_target_version := p_target_version - 1;
    END IF;
    
    -- Get the target version customization
    SELECT * INTO v_target_customization
    FROM site_customizations
    WHERE site_id = p_site_id 
        AND page_path = p_page_path
        AND block_type = p_block_type
        AND block_identifier = p_block_identifier
        AND version = p_target_version;
    
    -- If target version doesn't exist, return false
    IF v_target_customization IS NULL THEN
        RETURN false;
    END IF;
    
    -- Deactivate current active customization
    UPDATE site_customizations 
    SET is_active = false, updated_at = NOW()
    WHERE site_id = p_site_id 
        AND page_path = p_page_path
        AND block_type = p_block_type
        AND block_identifier = p_block_identifier
        AND is_active = true;
    
    -- Create new record with target customizations (new version)
    INSERT INTO site_customizations (
        site_id, page_path, block_type, block_identifier, 
        customizations, version, is_active
    ) 
    SELECT 
        site_id, page_path, block_type, block_identifier,
        customizations, 
        (SELECT COALESCE(MAX(version), 0) + 1 FROM site_customizations 
         WHERE site_id = p_site_id AND page_path = p_page_path 
         AND block_type = p_block_type AND block_identifier = p_block_identifier),
        true
    FROM site_customizations
    WHERE id = v_target_customization.id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;