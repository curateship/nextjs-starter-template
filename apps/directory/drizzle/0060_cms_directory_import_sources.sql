ALTER TABLE "directory_listings"
  ADD COLUMN IF NOT EXISTS "source_type" varchar(60),
  ADD COLUMN IF NOT EXISTS "source_id" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_listings_workspace_source"
  ON "directory_listings" ("workspace_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;
