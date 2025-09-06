-- Add performance indexes to optimize query speed
-- This should reduce server response times significantly

-- Sites table indexes (for middleware and site lookups)
CREATE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain);
CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON sites(custom_domain);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
CREATE INDEX IF NOT EXISTS idx_sites_status_subdomain ON sites(status, subdomain);
CREATE INDEX IF NOT EXISTS idx_sites_status_custom_domain ON sites(status, custom_domain);

-- Media table indexes (for media library performance)
CREATE INDEX IF NOT EXISTS idx_media_file_type ON media(file_type);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);

-- Posts table indexes (for content queries)
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_site_id ON posts(site_id);
CREATE INDEX IF NOT EXISTS idx_posts_site_status ON posts(site_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Products table indexes (for product queries)
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_site_id ON products(site_id);
CREATE INDEX IF NOT EXISTS idx_products_site_status ON products(site_id, status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- Pages table indexes (for page lookups)
CREATE INDEX IF NOT EXISTS idx_pages_site_id ON pages(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_site_slug ON pages(site_id, slug);

-- Directories table indexes (for directory queries)
CREATE INDEX IF NOT EXISTS idx_directories_site_id ON directories(site_id);
CREATE INDEX IF NOT EXISTS idx_directories_status ON directories(status);
CREATE INDEX IF NOT EXISTS idx_directories_site_status ON directories(site_id, status);

-- Events table indexes (for event queries)
CREATE INDEX IF NOT EXISTS idx_events_site_id ON events(site_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_site_status ON events(site_id, status);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date DESC);