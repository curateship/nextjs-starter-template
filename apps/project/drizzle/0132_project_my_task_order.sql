-- My dashboard's List in my own order (Tyler, 23 Oct 2026: "I want to be able
-- to drag and drop tasks into different order and sections"). One row per
-- person per task, which only that person sees. `heading` is the List heading
-- the place was set under; once the task sits under another heading, the row
-- no longer counts and the task goes to the bottom there.
CREATE TABLE IF NOT EXISTS "project_my_task_order" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "heading" varchar(16) NOT NULL,
  "position" integer NOT NULL,
  PRIMARY KEY ("user_id", "task_id")
);
