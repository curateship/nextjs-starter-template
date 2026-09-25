-- Index for "near me" distance search on directory listings.
-- The radius query prefilters with a latitude/longitude bounding box before the
-- exact Haversine test; this partial index covers that box scan and only carries
-- rows that were successfully geocoded.

CREATE INDEX IF NOT EXISTS idx_directories_site_coordinates
  ON directory (site_id, latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
