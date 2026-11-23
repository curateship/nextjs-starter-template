-- Reddit's own relevance position, so the ranking can use it.
--
-- Why: the first ranking multiplied upvotes in. Run against "reddit marketing
-- tool" on 5 Oct 2026 it put a horror story from r/nosleep top (314 upvotes, 28
-- replies, rank 1.02) and the two posts actually worth answering tenth and
-- eleventh: r/SaaS "Thinking about building a tool that shows which Reddit
-- threads..." (3 upvotes, 5 replies) and r/SocialMediaMarketing "Reddit for
-- marketers, by the numbers" (1 upvote, 1 reply), both at rank 0.15.
--
-- Upvotes measure how big a subreddit is far more than how relevant a post is
-- to you, so they are no longer part of the score. What relevance there is
-- comes from Reddit, which already returned the posts in its own relevance
-- order: this column keeps that order so the ranking can respect it.
--
-- 0 for every row that already exists, which reads as "first" and so leaves the
-- old rows ranked a little generously until their keyword is searched again.
ALTER TABLE "promo_finds"
  ADD COLUMN IF NOT EXISTS "reddit_position" integer NOT NULL DEFAULT 0;
