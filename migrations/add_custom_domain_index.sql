-- Add index on custom_domain column for fast middleware lookups
-- This is critical for performance when middleware queries custom domains

-- Create index on custom_domain column (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON sites(custom_domain) 
WHERE custom_domain IS NOT NULL;

-- Create composite index for custom_domain + status for even faster queries
CREATE INDEX IF NOT EXISTS idx_sites_custom_domain_status ON sites(custom_domain, status) 
WHERE custom_domain IS NOT NULL;

-- Add comment explaining the index purpose
COMMENT ON INDEX idx_sites_custom_domain IS 'Index for fast custom domain lookups in middleware';
COMMENT ON INDEX idx_sites_custom_domain_status IS 'Composite index for custom domain + status filtering in middleware';