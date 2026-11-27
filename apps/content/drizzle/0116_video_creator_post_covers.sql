-- A followed creator's video keeps its own copy of its cover picture. TikTok
-- and Instagram hand out cover addresses that stop working after a set date
-- (one saved on 2 Oct 2026 stopped on 15 Oct), so the address alone leaves a
-- blank card. Fetching the picture needs no video download and no AI.
-- `cover_checked_at` is when the app last tried, so a cover that cannot be
-- fetched is tried again a day later rather than on every pass.
ALTER TABLE "video_creator_posts" ADD COLUMN IF NOT EXISTS "thumbnail_storage_path" text;
ALTER TABLE "video_creator_posts" ADD COLUMN IF NOT EXISTS "cover_checked_at" timestamp with time zone;
