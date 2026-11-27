-- A Reddit post of your own can be a picture post or a link post, not only
-- text (part 7 of workspace/tasks/New features/new-features-18-nov.md).
-- Every post made before this is a text post.
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'text';
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "image_url" varchar(2048) NOT NULL DEFAULT '';
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "link_url" varchar(2048) NOT NULL DEFAULT '';
