-- Due at a time of day (Features 13 Oct task 04). The optional moment a task
-- is due by, such as 3:00 PM on its due date in the zone of whoever set it.
-- "due_date" stays the day; this column is null for a task due all day, and
-- every change of the date without a time clears it.
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "due_at" timestamptz;
