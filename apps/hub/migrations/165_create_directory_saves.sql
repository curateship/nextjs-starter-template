CREATE TABLE IF NOT EXISTS directory_save_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  default_key VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_save_collections_site_user_default
  ON directory_save_collections(site_id, user_id, default_key)
  WHERE default_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_directory_save_collections_site_user_created
  ON directory_save_collections(site_id, user_id, created_at ASC, id);

CREATE TABLE IF NOT EXISTS directory_save_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES directory_save_collections(id) ON DELETE CASCADE,
  directory_id UUID NOT NULL REFERENCES directory(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_save_items_collection_directory
  ON directory_save_items(collection_id, directory_id);

CREATE INDEX IF NOT EXISTS idx_directory_save_items_site_user_created
  ON directory_save_items(site_id, user_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_directory_save_items_directory_user
  ON directory_save_items(directory_id, user_id);
