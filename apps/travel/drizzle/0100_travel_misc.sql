-- Tyler, 2 Nov 2026 (task "Misc"): "Remove the packing list, before you go,
-- emergency and document card feature". Nothing is live, so their tables,
-- column and rows go. Document files already in the bucket are left there:
-- only test files were ever uploaded.
DROP TABLE IF EXISTS "travel_checklist_items";
DROP TABLE IF EXISTS "travel_files";
ALTER TABLE "travel_trips" DROP COLUMN IF EXISTS "emergency";

-- A trip's description, the editor's own document as JSON text, or "".
ALTER TABLE "travel_trips" ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';

-- The trip's notes, opened from the note icon beside the trip's cog: as many
-- as the person likes, each the editor's own document as JSON text.
CREATE TABLE IF NOT EXISTS "travel_trip_notes" (
  "id" varchar(36) PRIMARY KEY,
  "trip_id" varchar(36) NOT NULL REFERENCES "travel_trips" ("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_travel_trip_notes_trip" ON "travel_trip_notes" ("trip_id", "updated_at");
