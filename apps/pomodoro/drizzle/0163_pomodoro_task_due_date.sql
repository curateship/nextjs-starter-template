-- A task's due date, apart from the day it is planned on (Tyler's pick, 7 Nov
-- 2026, "Due dates on tasks"). Null means no deadline, so every existing task
-- keeps none.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_date" date;
