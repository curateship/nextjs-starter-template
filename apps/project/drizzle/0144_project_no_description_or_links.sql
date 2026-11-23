-- The project page's left panel lost its description and its links (Tyler,
-- 5 Nov 2026: "Remove the discription. Remove this discription and links
-- feature"). Nothing else showed either, so both columns go; Project holds
-- only test data, so nothing is kept. In their place the panel has a page of
-- notes with "/" blocks, a Links block among them (Tyler: "Where the avatar
-- used to be. Add the tiptap editor with a couple of blocks like a links block
-- and call out block"), saved as the notes' document in "notes".
ALTER TABLE "project_projects" DROP COLUMN IF EXISTS "description";
ALTER TABLE "project_projects" DROP COLUMN IF EXISTS "links";
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT '';
