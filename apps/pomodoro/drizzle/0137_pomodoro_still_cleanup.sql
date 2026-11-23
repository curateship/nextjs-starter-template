-- Stills leave the bucket however their upload goes (10 Oct 2026). Tyler:
-- "Clear the stills when an account is deleted."
--
-- A clip's still has no library row, so neither the shell's account purge,
-- its Media page delete nor its orphan sweep knows about it. Instead the
-- database notes the still's path whenever an upload row is deleted (by a
-- member, an admin, the Media page, or an account purge cascading through)
-- or its still is replaced by a new cut's, and the media worker removes each
-- noted file from the bucket on its next pass. One path, for every way in.
CREATE TABLE IF NOT EXISTS "pomodoro_bucket_deletions" (
  "path" varchar(300) PRIMARY KEY,
  "queued_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION "pomodoro_media_uploads_queue_still"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."still_path" IS NOT NULL AND OLD."still_path" <> '' THEN
      INSERT INTO "pomodoro_bucket_deletions" ("path") VALUES (OLD."still_path")
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."still_path" IS NOT NULL AND OLD."still_path" <> ''
     AND OLD."still_path" IS DISTINCT FROM NEW."still_path" THEN
    INSERT INTO "pomodoro_bucket_deletions" ("path") VALUES (OLD."still_path")
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "pomodoro_media_uploads_queue_still" ON "pomodoro_media_uploads";
CREATE TRIGGER "pomodoro_media_uploads_queue_still"
  AFTER DELETE OR UPDATE OF "still_path" ON "pomodoro_media_uploads"
  FOR EACH ROW EXECUTE FUNCTION "pomodoro_media_uploads_queue_still"();
