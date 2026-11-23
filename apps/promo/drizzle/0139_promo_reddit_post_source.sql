-- A Reddit post made from a post the Viral app wrote is reported back to
-- Viral, like X and LinkedIn (apps/viral/workspace/tasks/features/
-- 02-more-viral-features.md, part 13). New post opened from
-- ?network=reddit&newPost=<id> keeps where the words came from, as
-- "viral:<idea id>", the same source X and LinkedIn drafts keep. "" is a
-- post written in Promo.
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "source" varchar(80) NOT NULL DEFAULT '';
