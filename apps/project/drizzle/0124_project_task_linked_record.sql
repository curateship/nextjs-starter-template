-- A task can point at one record in Video or Promo (Connected apps task 01,
-- Tyler, 19 Oct 2026). The app, the record's id in that app, and the address
-- the site admin pasted. All three are empty on a task that points at nothing.
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "linked_app" varchar(16);
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "linked_record_id" varchar(64);
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "linked_address" text;
