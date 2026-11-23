-- Today's task list. focus_sessions.task_id, created empty in 0082, now
-- points at it: a deleted task keeps the finished sessions it earned.
CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(160) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "planned_date" date NOT NULL,
  "pomodoro_count" integer NOT NULL DEFAULT 0,
  "priority" varchar(10) NOT NULL DEFAULT 'normal',
  "estimated_pomodoros" integer,
  "sort_order" integer NOT NULL DEFAULT 0,
  "carried_to_task_id" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tasks_status_check" CHECK ("status" IN ('active', 'completed', 'carried', 'abandoned')),
  CONSTRAINT "tasks_priority_check" CHECK ("priority" IN ('low', 'normal', 'high')),
  CONSTRAINT "tasks_estimated_pomodoros_check" CHECK ("estimated_pomodoros" IS NULL OR "estimated_pomodoros" BETWEEN 1 AND 20),
  CONSTRAINT "tasks_sort_order_check" CHECK ("sort_order" >= 0)
);
CREATE INDEX IF NOT EXISTS "tasks_user_date_idx" ON "tasks" ("user_id", "planned_date");

ALTER TABLE "focus_sessions"
  ADD CONSTRAINT "focus_sessions_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL;
