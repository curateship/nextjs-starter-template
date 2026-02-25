ALTER TABLE sites ADD COLUMN is_template BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_sites_is_template ON sites(is_template);
