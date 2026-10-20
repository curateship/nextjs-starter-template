-- Cheaper first look (part 5 of "features/02-swiping-and-scoring"): the model
-- whose score counts, Sonnet's first look or Opus's second. Cards read before
-- this were all Opus, and stay empty here.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "ai_model" varchar(40);
