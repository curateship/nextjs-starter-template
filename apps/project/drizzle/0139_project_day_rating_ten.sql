-- A day's rating goes from 1 to 10 instead of 1 to 5 (Tyler, 30 Oct 2026:
-- "rating should be out of 10, not 5"). Ratings already given are doubled so
-- a 4 of 5 reads 8 of 10.
--
-- The intention is the notes editor's saved document since 30 Oct 2026, up to
-- 20,000 characters, so its column grows to hold it.
ALTER TABLE "project_journal_days" DROP CONSTRAINT IF EXISTS "project_journal_days_rating";
UPDATE "project_journal_days" SET "rating" = "rating" * 2 WHERE "rating" BETWEEN 1 AND 5;
ALTER TABLE "project_journal_days" ADD CONSTRAINT "project_journal_days_rating" CHECK ("rating" BETWEEN 1 AND 10);
ALTER TABLE "project_journal_days" ALTER COLUMN "intention" TYPE varchar(20000);
