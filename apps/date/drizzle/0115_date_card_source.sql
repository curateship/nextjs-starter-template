-- Likes you, first (part 9 of "facebook/01-facebook-dating"): where a card
-- came from ('card', 'likes_you' or Facebook's 'weekly' surprise match, part
-- 21), and the comment they sent with their like and what it was on (part 16).
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "source" varchar(12) NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS "their_comment" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "their_comment_on" text NOT NULL DEFAULT '';
