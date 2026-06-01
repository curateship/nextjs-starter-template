ALTER TABLE directory
ADD COLUMN IF NOT EXISTS directory_data JSONB NOT NULL DEFAULT '{}'::jsonb;
