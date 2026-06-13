-- Drop the trending-velocity feature: the per-day views badge and "Trending"
-- sort were removed, so the engagement-snapshot table is no longer used. The
-- creators.watch / last_checked_at columns stay (creator auto-ingest remains).
DROP TABLE IF EXISTS "viral_video_stats";
