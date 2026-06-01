ALTER TABLE "directory"
  ADD COLUMN IF NOT EXISTS "source_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "source_id" varchar(255);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'directory'
      AND column_name = 'google_maps_place_id'
  ) THEN
    UPDATE "directory"
    SET
      "source_type" = 'google_maps',
      "source_id" = "google_maps_place_id"
    WHERE "google_maps_place_id" IS NOT NULL
      AND "google_maps_place_id" <> ''
      AND ("source_type" IS NULL OR "source_type" = '')
      AND ("source_id" IS NULL OR "source_id" = '');
  END IF;
END $$;

DROP INDEX IF EXISTS "idx_directories_site_google_maps_place_id";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_directories_site_source"
  ON "directory" ("site_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_type" <> ''
    AND "source_id" IS NOT NULL AND "source_id" <> '';

ALTER TABLE "directory"
  DROP COLUMN IF EXISTS "google_maps_place_id";
