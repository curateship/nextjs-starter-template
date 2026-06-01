ALTER TABLE "directory"
  ADD COLUMN IF NOT EXISTS "source_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "source_id" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_directories_site_source"
  ON "directory" ("site_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_type" <> ''
    AND "source_id" IS NOT NULL AND "source_id" <> '';
