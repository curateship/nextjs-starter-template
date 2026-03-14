ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '{}';
