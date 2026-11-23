-- A fifth task status, Archived (Tyler, 25 Oct 2026: "add another status
-- called 'Archived'"). An archived task keeps its Board column and leaves
-- every list of open work. A check-in pick can end its day archived too.
ALTER TABLE "project_tasks" DROP CONSTRAINT IF EXISTS "project_tasks_status";
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_status"
  CHECK ("status" IN ('todo', 'doing', 'done', 'stuck', 'archived'));

ALTER TABLE "project_checkin_items" DROP CONSTRAINT IF EXISTS "project_checkin_items_end_status";
ALTER TABLE "project_checkin_items" ADD CONSTRAINT "project_checkin_items_end_status"
  CHECK ("end_status" IS NULL OR "end_status" IN ('todo', 'doing', 'done', 'stuck', 'archived'));
