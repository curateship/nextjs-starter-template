-- Second Look (part 14 of "facebook/01-facebook-dating"): when a card the AI
-- passed was liked by the member from the Second Look list.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "second_look_at" timestamptz;
