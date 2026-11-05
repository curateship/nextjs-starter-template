-- A Viral project's notes: one written page behind the notes icon in the
-- project page's left panel, saved as the shell's editor JSON, the way a
-- Travel trip's notes are. The description stays plain text, because the
-- topic match and keyword ideas read it.
--
-- Task: workspace/tasks/viral-research/01-viral-research-app.md, part 5.

ALTER TABLE "viral_projects" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT '';
