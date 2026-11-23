-- Re-trimming an upload from the cog on its card (10 Oct 2026). Tyler: "I
-- should be able to reclip the file too", keeping the original so a new trim
-- can reach parts an earlier one cut.
--
-- The original is a library file of its own (`media`), so it counts toward
-- the member's space like any file and the storage page's orphan sweep sees a
-- row for it. `source_media_id` points at it. It is set the first time the
-- worker prepares a sound or clip, or when an older upload is first re-trimmed
-- (its prepared file becomes the source, so it can only be cut shorter).
--
-- While it is set, the upload's own library row always holds a finished file,
-- so the card keeps playing the old cut while a new one is prepared.
ALTER TABLE "pomodoro_media_uploads"
  ADD COLUMN IF NOT EXISTS "source_media_id" varchar(36)
    REFERENCES "media"("id") ON DELETE SET NULL;
