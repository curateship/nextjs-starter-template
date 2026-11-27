-- More frames along long videos (workspace/tasks/big-files/
-- 01-big-file-features.md, part 17; workspace/docs/big-files.md, "Frames
-- along a long video").
--
-- A strip used to stop at 120 frames in one picture, so an hour-long clip
-- showed a frame every thirty seconds. Now a long video gets one every five
-- seconds, spread over several pictures ("sheets") of up to 120 frames each.
-- `sheet_count` is how many; `rows_per_sheet` is each sheet's grid height.
-- Strips made before this have one sheet and leave `rows_per_sheet` empty,
-- which reads as the old single picture, so the old release and the new one
-- both draw them.
ALTER TABLE "video_media_filmstrips"
  ADD COLUMN IF NOT EXISTS "sheet_count" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "rows_per_sheet" integer;
DO $$ BEGIN
  ALTER TABLE "video_media_filmstrips" ADD CONSTRAINT "video_media_filmstrips_sheets_check"
    CHECK ("sheet_count" >= 1 AND ("rows_per_sheet" IS NULL OR "rows_per_sheet" >= 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
