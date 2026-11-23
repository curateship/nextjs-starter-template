-- The sidebar width is a personal thing, so it moves onto the person.
--
-- It used to be saved in the workspace's settings, which made it one width for
-- everybody in that workspace. On an app that is one site everybody is in the
-- same one, so a member dragging their rail resized the admin's.
--
-- Nobody's sidebar should change width because of this move, so each person
-- starts on the width their current workspace was saving for them. Somebody in
-- no workspace, or in one that never had a width saved, keeps NULL and gets the
-- default (218px) — which is exactly what they were seeing already.
--
-- The workspace copy is left in place rather than stripped out of the jsonb.
-- Nothing reads it any more, and an untouched column is one fewer thing to get
-- wrong in a migration that has no way back.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sidebar_width" integer;

UPDATE "users" u
SET "sidebar_width" = (w."settings"->>'sidebarWidth')::int
FROM "workspaces" w
WHERE u."current_workspace_id" = w."id"
  AND u."sidebar_width" IS NULL
  AND jsonb_typeof(w."settings") = 'object'
  AND jsonb_typeof(w."settings"->'sidebarWidth') = 'number'
  AND (w."settings"->>'sidebarWidth')::int BETWEEN 144 AND 420;
