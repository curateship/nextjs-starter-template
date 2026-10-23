-- New prompt answers (part 2 of "features/03-your-profile"): the AI's review
-- suggests a new answer for each of the member's Tinder prompts. A review
-- made before this suggested none.
--
-- Additions only. Nothing stored is renamed or dropped.

UPDATE "date_own_profile"
SET "review" = jsonb_set("review", '{prompts}', '[]'::jsonb)
WHERE "review" IS NOT NULL AND NOT ("review" ? 'prompts');
