-- The browse page's map view, per site.
--
-- Two columns, and they are deliberately not one. `map_enabled` is the site's
-- decision to offer the view at all; `map_display_key_encrypted` is the Google
-- key the visitor's browser needs to draw it.
--
-- It is a second key rather than the geocoding one because Google will not let
-- one key do both jobs safely: a browser key is restricted to a website
-- address, and a key restricted that way is refused by the server-side
-- Geocoding API. Sharing one key would mean leaving it unrestricted, and an
-- unrestricted key sitting in a public page is somebody else's free geocoding
-- on this site's bill.
--
-- Off by default, so every site that already exists is unchanged by this
-- shipping.
ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "map_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "map_display_key_encrypted" varchar(700);
