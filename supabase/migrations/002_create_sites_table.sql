-- Create sites table for storing user sites with theme associations
-- This table manages all sites created by users with their theme selections

CREATE TABLE IF NOT EXISTS sites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    custom_domain VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'inactive', 'draft', 'suspended')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_theme_id ON sites(theme_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain);
CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON sites(custom_domain) WHERE custom_domain IS NOT NULL;

-- Create composite index for user's sites
CREATE INDEX IF NOT EXISTS idx_sites_user_status ON sites(user_id, status);

-- Add constraint to ensure subdomain follows valid format (alphanumeric and hyphens only)
ALTER TABLE sites ADD CONSTRAINT check_subdomain_format 
    CHECK (subdomain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND LENGTH(subdomain) >= 3 AND LENGTH(subdomain) <= 63);

-- Add constraint to ensure custom_domain follows valid format if provided
ALTER TABLE sites ADD CONSTRAINT check_custom_domain_format 
    CHECK (custom_domain IS NULL OR custom_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$');

-- Create updated_at trigger for automatic timestamp updates
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate unique subdomain suggestions
CREATE OR REPLACE FUNCTION generate_subdomain_suggestion(base_name TEXT)
RETURNS TEXT AS $$
DECLARE
    clean_name TEXT;
    suggested_subdomain TEXT;
    counter INTEGER := 0;
BEGIN
    -- Clean the base name: lowercase, replace spaces/special chars with hyphens
    clean_name := LOWER(REGEXP_REPLACE(base_name, '[^a-zA-Z0-9]', '-', 'g'));
    clean_name := REGEXP_REPLACE(clean_name, '-+', '-', 'g');
    clean_name := TRIM(clean_name, '-');
    
    -- Ensure minimum length
    IF LENGTH(clean_name) < 3 THEN
        clean_name := clean_name || '-site';
    END IF;
    
    -- Ensure maximum length
    IF LENGTH(clean_name) > 50 THEN
        clean_name := LEFT(clean_name, 50);
    END IF;
    
    -- Try the clean name first
    suggested_subdomain := clean_name;
    
    -- If it exists, append numbers until we find a unique one
    WHILE EXISTS (SELECT 1 FROM sites WHERE subdomain = suggested_subdomain) LOOP
        counter := counter + 1;
        suggested_subdomain := clean_name || '-' || counter::TEXT;
        
        -- Prevent infinite loop
        IF counter > 1000 THEN
            suggested_subdomain := clean_name || '-' || EXTRACT(EPOCH FROM NOW())::INTEGER::TEXT;
            EXIT;
        END IF;
    END LOOP;
    
    RETURN suggested_subdomain;
END;
$$ LANGUAGE plpgsql;