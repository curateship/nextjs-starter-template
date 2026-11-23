-- Like with a comment (part 10 of "facebook/01-facebook-dating"): the
-- comment the AI wrote and sent with a like, and the photo or answer it was
-- about, so the opener after a match knows what was already said.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "like_comment" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "like_comment_on" text NOT NULL DEFAULT '';
