-- How long a post takes to read, in whole minutes, for the "4 min read" chip
-- on a post card. Counted when a post is saved and kept here, so drawing a
-- page of cards never has to fetch twelve article bodies to print twelve small
-- numbers.
--
-- 1 rather than 0 for the posts that already exist: every post takes at least a
-- minute by the same rule, and the real figure is written the next time each
-- one is saved. A backfill from the stored body would mean counting words in
-- SQL, which would not agree with the helper that counts them everywhere else.
ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "read_minutes" integer NOT NULL DEFAULT 1;
