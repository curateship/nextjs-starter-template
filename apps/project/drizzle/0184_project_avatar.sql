-- A project may have an avatar again, drawn before its name in the project
-- page's header (Tyler, 17 Nov 2026: "I want to be able to add an optional
-- avatar here", then "Header only and this is only for project. I want to be
-- able to use images, svg (like the pomodoro animattion logo) or even mp4").
-- 0145 dropped the old one. A media library address, or null for none.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "avatar_url" text;
