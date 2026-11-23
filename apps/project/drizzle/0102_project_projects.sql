-- Projects (Next features task 06): a project's own due date, and three more
-- moments written down as they happen so the project's Activity tab can list
-- them. The existing kinds keep their names.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "due_date" date;

ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved',
      'deleted', 'restored', 'created', 'status_changed', 'commented'
    )
  );

-- The Activity tab reads a project's events newest first.
CREATE INDEX IF NOT EXISTS "ix_project_task_events_created"
  ON "project_task_events" ("created_at" DESC);
