ALTER TABLE "directory_listings"
  ADD COLUMN "gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN "latitude" numeric(9, 6),
  ADD COLUMN "longitude" numeric(10, 6);

ALTER TABLE "directory_listings"
  ADD CONSTRAINT "directory_listings_coordinates_check"
  CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR (
      "latitude" IS NOT NULL
      AND "longitude" IS NOT NULL
      AND "latitude" BETWEEN -90 AND 90
      AND "longitude" BETWEEN -180 AND 180
    )
  );

CREATE INDEX "ix_directory_listings_workspace_coordinates"
  ON "directory_listings" ("workspace_id", "latitude", "longitude")
  WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
