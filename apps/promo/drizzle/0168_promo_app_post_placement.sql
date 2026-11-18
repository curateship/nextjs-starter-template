-- Where an Instagram or TikTok post goes: the feed, or an Instagram Story
-- (part 8 of workspace/tasks/New features/new-features-18-nov.md). Every
-- post made before this went to the feed.
ALTER TABLE "promo_app_posts" ADD COLUMN IF NOT EXISTS "placement" varchar(10) NOT NULL DEFAULT 'feed';
