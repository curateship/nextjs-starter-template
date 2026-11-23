-- Re-trimming kept honest (audit, 10 Oct 2026).
--
-- `queued_at` is when a sound or clip last joined the worker's queue. The
-- worker takes the oldest first by it, not by when the file was uploaded, so
-- a re-trim of an old file goes to the back of the line instead of ahead of
-- everybody's new uploads. Existing rows join at their upload time.
ALTER TABLE "pomodoro_media_uploads"
  ADD COLUMN IF NOT EXISTS "queued_at" timestamp with time zone NOT NULL DEFAULT now();
UPDATE "pomodoro_media_uploads" SET "queued_at" = "created_at"
  WHERE "queued_at" > "created_at";

CREATE INDEX IF NOT EXISTS "pomodoro_media_uploads_status_queued_idx"
  ON "pomodoro_media_uploads" ("status", "queued_at");

-- Deleting a library file anywhere clears the pointer to it, and this finds
-- the upload that points at it without reading the whole table.
CREATE INDEX IF NOT EXISTS "pomodoro_media_uploads_source_idx"
  ON "pomodoro_media_uploads" ("source_media_id")
  WHERE "source_media_id" IS NOT NULL;

-- An upload's kept original goes with the upload, however the upload goes:
-- the member's delete, the admin's uploads page, or the shell's own Media
-- page, which knows nothing about originals. Only the row goes here; a bucket
-- file left without a row is what the storage page's orphan sweep removes.
CREATE OR REPLACE FUNCTION "pomodoro_media_uploads_drop_source"() RETURNS trigger AS $$
BEGIN
  IF OLD."source_media_id" IS NOT NULL THEN
    DELETE FROM "media" WHERE "id" = OLD."source_media_id";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "pomodoro_media_uploads_drop_source" ON "pomodoro_media_uploads";
CREATE TRIGGER "pomodoro_media_uploads_drop_source"
  AFTER DELETE ON "pomodoro_media_uploads"
  FOR EACH ROW EXECUTE FUNCTION "pomodoro_media_uploads_drop_source"();
