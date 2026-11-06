-- Task templates leave Project (Tyler, 6 Nov 2026: "We need to remove the
-- tasks templates feature too"), and every task's fields go with them ("Fields
-- go too"). Project holds only test data, so templates take their tables,
-- columns and saved rows with them: the team's templates, their fields, what
-- each task held in them, a task's template, a project's pick of templates and
-- the one New task started on. The live-update trigger on the field values
-- goes with its table; the function it called stays, since other task tables
-- still use it.

-- A file kept in a File field belonged to nothing else, so its row goes. The
-- stored file itself is not removed by this: SQL can't reach storage.
DELETE FROM "project_task_files" WHERE "field_id" IS NOT NULL;
ALTER TABLE "project_task_files" DROP COLUMN IF EXISTS "field_id";
ALTER TABLE "project_tasks" DROP COLUMN IF EXISTS "type_id";
-- Who first handed a task out was kept only to decide who could change its
-- template and a field limited to "whoever handed it out", so it goes too.
ALTER TABLE "project_tasks" DROP COLUMN IF EXISTS "first_handed_out_by_user_id";
ALTER TABLE "project_projects" DROP COLUMN IF EXISTS "hidden_type_ids";
ALTER TABLE "project_projects" DROP COLUMN IF EXISTS "default_type_id";
DROP TABLE IF EXISTS "project_task_field_values";
DROP TABLE IF EXISTS "project_task_type_fields";
DROP TABLE IF EXISTS "project_task_types";


-- The "named you on a task" bell notices came only from a Person field, and
-- their switch in My settings goes with them.
DELETE FROM "notifications"
  WHERE "id" IN (SELECT "notice_id" FROM "project_notice_links" WHERE "kind" = 'task_field_person');
DELETE FROM "project_notices_off" WHERE "kind" = 'task_field_person';

-- Saved views on Project's task screens forget their Template filter, the
-- template's name kept beside it, and a "Group by Template". A view left with
-- nothing to show is deleted. The views live in the shell's table, so only
-- Project's screens are touched; the old Project table gets the same.
UPDATE "saved_views"
  SET "filters" = "filters" - 'type', "names" = "names" - 'type'
  WHERE ("screen" LIKE 'project:%' OR "screen" LIKE 'my-tasks:%' OR "screen" LIKE 'admin-tasks:%')
    AND ("filters"->>'type' IS NOT NULL OR "names"->>'type' IS NOT NULL);
UPDATE "saved_views"
  SET "filters" = "filters" - 'group'
  WHERE ("screen" LIKE 'project:%' OR "screen" LIKE 'my-tasks:%' OR "screen" LIKE 'admin-tasks:%')
    AND "filters"->>'group' = 'type';
DELETE FROM "saved_views"
  WHERE ("screen" LIKE 'project:%' OR "screen" LIKE 'my-tasks:%' OR "screen" LIKE 'admin-tasks:%')
    AND "filters" = '{}'::jsonb;

UPDATE "project_saved_views"
  SET "filters" = "filters" - 'type', "names" = "names" - 'type'
  WHERE "filters"->>'type' IS NOT NULL OR "names"->>'type' IS NOT NULL;
UPDATE "project_saved_views"
  SET "filters" = "filters" - 'group'
  WHERE "filters"->>'group' = 'type';
DELETE FROM "project_saved_views" WHERE "filters" = '{}'::jsonb;
