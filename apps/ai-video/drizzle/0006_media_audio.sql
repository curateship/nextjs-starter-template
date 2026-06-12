-- Allow audio files in the media library (video editor "add sound" support).
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_file_type_check";
ALTER TABLE "media" ADD CONSTRAINT "media_file_type_check" CHECK ("file_type" in ('image', 'video', 'audio'));
