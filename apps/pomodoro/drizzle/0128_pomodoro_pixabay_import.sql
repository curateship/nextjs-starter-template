-- Import from Pixabay (admin task 09, 9 Oct 2026).
--
-- The Pixabay page a picture or film is still being fetched from. The
-- pomodoro-pixabay-imports worker claims rows where this is set and the file
-- is queued, and empties it once the file is in the bucket or refused. A music
-- link never sets it, because nothing is fetched for a sound.
ALTER TABLE "pomodoro_catalog_items" ADD COLUMN IF NOT EXISTS "import_url" varchar(500);
