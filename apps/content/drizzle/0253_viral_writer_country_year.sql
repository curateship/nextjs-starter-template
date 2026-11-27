-- Three parts of the "More Viral features" task (workspace/tasks/features/02-more-viral-features.md).
--
-- Part 9, Pick the writer: which AI writes Viral's words, picked once on
-- Settings → AI writer (workspace/docs/ai-analysis.md). NULL is Gemini Flash.
ALTER TABLE "viral_settings" ADD COLUMN IF NOT EXISTS "writer" varchar(20);
ALTER TABLE "viral_settings" DROP CONSTRAINT IF EXISTS "ck_viral_settings_writer";
ALTER TABLE "viral_settings"
  ADD CONSTRAINT "ck_viral_settings_writer" CHECK ("writer" in ('gemini', 'openai', 'anthropic'));

-- Part 11, Country and language: what a project's YouTube searches send as
-- regionCode (ISO 3166-1, such as GB) and relevanceLanguage (ISO 639-1, such
-- as en, or zh-Hans and zh-Hant). NULL is Anywhere, which sends neither, so a
-- project made before this searches as it always did.
ALTER TABLE "viral_projects" ADD COLUMN IF NOT EXISTS "region_code" varchar(2);
ALTER TABLE "viral_projects" ADD COLUMN IF NOT EXISTS "relevance_language" varchar(10);

-- Part 12, A year back: Posted within also offers 6 months and 1 year.
-- Postgres has no "alter check". Every existing row is 7, 30 or 90, and all
-- three still match, so no row changes.
ALTER TABLE "viral_projects" DROP CONSTRAINT IF EXISTS "ck_viral_projects_days";
ALTER TABLE "viral_projects"
  ADD CONSTRAINT "ck_viral_projects_days" CHECK ("days" in (7, 30, 90, 180, 365));
