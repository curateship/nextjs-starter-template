-- Adds geocoded coordinates to directory listings for the listing-views map mode.
-- latitude/longitude are populated by geocoding the directory-core block address on save;
-- geocoded_address caches the address that produced the coordinates so unchanged
-- addresses skip re-geocoding.

ALTER TABLE directory ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE directory ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE directory ADD COLUMN IF NOT EXISTS geocoded_address TEXT;
