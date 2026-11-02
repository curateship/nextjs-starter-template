-- Profile photos. One column on `users` holding the public URL of a picture the
-- account already uploaded through the media library, so the shell can draw it
-- without a second query on every page load.
--
-- The URL is stored rather than a media id on purpose: the picker and the whole
-- media pipeline already deal in URLs, and the sidebar reads this on every load.
-- The server only ever accepts a URL that resolves to one of this account's own
-- images, so a stored value can never point somewhere else.
--
-- Null means no photo, and the shell falls back to the account's initials.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "avatar_url" text;
