CREATE TABLE IF NOT EXISTS site_search_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source_type varchar(30) NOT NULL,
  source_id text NOT NULL,
  url text NOT NULL,
  title text NOT NULL,
  summary text,
  image text,
  searchable_text text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(searchable_text, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_search_documents_source_unique
  ON site_search_documents(site_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_site_search_documents_site_type
  ON site_search_documents(site_id, source_type);

CREATE INDEX IF NOT EXISTS idx_site_search_documents_vector
  ON site_search_documents USING gin(search_vector);
