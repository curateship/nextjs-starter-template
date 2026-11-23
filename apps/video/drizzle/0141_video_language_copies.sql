-- Every language in one press (workspace/tasks/ai-generation/12-every-language-in-one-press.md;
-- workspace/docs/another-language.md). Each extra language is its own copy of
-- the project, and the copy remembers what it is a copy of, so the Exports
-- page can group its export under the original.
--
--   language_of  The project this one was translated from. Deleting that
--                project blanks it and the copy stays a project of its own.
--   language     The language the copy speaks, one of the 29 in
--                src/lib/video/translate.ts. NULL on every other project.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "language_of" varchar(36)
  REFERENCES "video_projects"("id") ON DELETE SET NULL;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "language" varchar(40);
CREATE INDEX IF NOT EXISTS "ix_video_projects_language_of"
  ON "video_projects" ("language_of");
