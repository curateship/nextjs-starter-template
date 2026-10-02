-- Sound belongs in the media library too.
--
-- The library has only ever accepted pictures and video, which was fine until
-- something in the app started making sound: a voiceover has to be kept
-- somewhere it can be trimmed, moved and used again, and that somewhere is
-- here rather than a second library beside it.
--
-- Only the list of kinds changes. Anything already stored stays exactly as it
-- is, and an app that never uploads sound sees no difference at all.
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_file_type_check";
ALTER TABLE "media"
  ADD CONSTRAINT "media_file_type_check"
  CHECK ("file_type" in ('image', 'video', 'audio'));
