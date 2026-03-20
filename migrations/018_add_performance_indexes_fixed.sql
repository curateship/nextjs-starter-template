-- Add performance indexes to optimize query speed (corrected version)
-- This should reduce server response times significantly

-- Sites table indexes (for middleware and site lookups) - CONFIRMED COLUMNS
CREATE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain);
CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON sites(custom_domain);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_sites_status_subdomain ON sites(status, subdomain);
CREATE INDEX IF NOT EXISTS idx_sites_status_custom_domain ON sites(status, custom_domain);

-- Media table indexes (for media library performance) - CONFIRMED COLUMNS  
CREATE INDEX IF NOT EXISTS idx_media_file_type ON media(file_type);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id);

-- Core table indexes that are safe to add
CREATE INDEX IF NOT EXISTS idx_posts_site_id ON posts(site_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_site_id ON products(site_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pages_site_id ON pages(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_site_slug ON pages(site_id, slug);

-- Only add indexes for tables that might exist
DO $$
BEGIN
    -- Add directories indexes if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'directories') THEN
        CREATE INDEX IF NOT EXISTS idx_directories_site_id ON directories(site_id);
        CREATE INDEX IF NOT EXISTS idx_directories_created_at ON directories(created_at DESC);
    END IF;

    -- Add events indexes if table exists  
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
        CREATE INDEX IF NOT EXISTS idx_events_site_id ON events(site_id);
        CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
        -- Only add event_date index if column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'event_date') THEN
            CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date DESC);
        END IF;
    END IF;
    
    -- Add status indexes only if status column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
        CREATE INDEX IF NOT EXISTS idx_posts_site_status ON posts(site_id, status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
        CREATE INDEX IF NOT EXISTS idx_products_site_status ON products(site_id, status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'directories' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_directories_status ON directories(status);
        CREATE INDEX IF NOT EXISTS idx_directories_site_status ON directories(site_id, status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
        CREATE INDEX IF NOT EXISTS idx_events_site_status ON events(site_id, status);
    END IF;
END $$;