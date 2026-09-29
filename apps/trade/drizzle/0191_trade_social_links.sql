-- The links a creator lists on their X profile: the website field and any
-- links in their bio, each with the words X shows for it.
--
-- Read from the public profile page along with the follower count, so both
-- are written by the same read and can never disagree about when they were
-- taken.
ALTER TABLE "trade_social_creators"
  ADD COLUMN IF NOT EXISTS "links" jsonb NOT NULL DEFAULT '[]'::jsonb;
