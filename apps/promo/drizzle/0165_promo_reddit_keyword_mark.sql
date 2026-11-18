-- A Reddit keyword marked Names you: the product's own name, which rings the
-- bell when a search finds new posts under it (part 5 of
-- workspace/tasks/New features/new-features-18-nov.md). Medium, X and
-- LinkedIn keywords already have this column. "" is ordinary words.
ALTER TABLE "promo_keywords" ADD COLUMN IF NOT EXISTS "mark" varchar(10) NOT NULL DEFAULT '';
