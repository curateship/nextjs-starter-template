-- Misc 5 (Tyler, 2 Nov 2026). A project's category, one list for the whole
-- site, picked or typed new in Project settings like the client, and the
-- Projects page's Category filter. A project's links: labelled addresses and
-- divider labels under its description, in the order they were dragged into.
-- The site admin's Projects card now shows only their pinned projects, so the
-- list of projects they hid from it goes.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "category" varchar(60);
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "links" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "project_site_admin_prefs" DROP COLUMN IF EXISTS "hidden_project_ids";
