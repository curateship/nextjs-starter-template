-- The site admin's own page of notes and "/" blocks at the top of My
-- dashboard's left panel, under the sky (Tyler, 6 Nov 2026: "add the tiptap
-- editor with blocks ability under the banner"). One page that stays; "" is
-- an empty page.
ALTER TABLE "project_site_admin_prefs" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT '';
