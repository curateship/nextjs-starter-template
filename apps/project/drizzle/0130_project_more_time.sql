-- Ask for more time (Seven features, part 2, Tyler, 20 Oct 2026). The person
-- doing a task asks for a later due date with a reason; whoever handed it out
-- answers Yes, which moves the date, or No. When nobody handed it out, the
-- site admin answers. One open ask per task, so it lives on the task: a new
-- ask replaces it, and an answer, Done, a hand-over or the bin ends it.
ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "more_time_day" date,
  ADD COLUMN IF NOT EXISTS "more_time_reason" text,
  ADD COLUMN IF NOT EXISTS "more_time_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "more_time_asked_at" timestamptz;

-- The ask and its answer in the task's history. A Yes is a date move too, so
-- it counts toward "Date moved 3 times". Saved kinds are never renamed.
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved',
      'deleted', 'restored', 'created', 'status_changed', 'commented',
      'review_confirmed', 'sent_back', 'due_moved',
      'took', 'clock_started', 'clock_paused', 'clock_fixed',
      'time_asked', 'time_agreed', 'time_kept'
    )
  );
