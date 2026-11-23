-- The Daily card's line for the day, Today I want to..., and the site admin's
-- own lines and night questions were taken out (Tyler, 3 Nov 2026). Project
-- has no real data, so their columns go with them.
ALTER TABLE "project_daily_cards" DROP COLUMN IF EXISTS "own_lines";
ALTER TABLE "project_daily_cards" DROP COLUMN IF EXISTS "own_questions";
ALTER TABLE "project_journal_days" DROP COLUMN IF EXISTS "intention";
ALTER TABLE "project_journal_days" DROP COLUMN IF EXISTS "question";
ALTER TABLE "project_journal_days" DROP COLUMN IF EXISTS "answer";
