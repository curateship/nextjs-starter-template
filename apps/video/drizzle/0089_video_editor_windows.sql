-- Which editor windows have a project open right now, so opening a project
-- that is already being edited somewhere else can say so before anything is
-- typed into it.
--
-- One row per open window. The window makes up its own id and keeps it across
-- a reload of the same tab, so reloading never finds itself as "somebody
-- else". Each window writes `seen_at` every 15 seconds while it is open and
-- deletes its row when it closes. A row not written for 90 seconds counts as
-- closed, because a closed laptop or a crashed tab never gets to delete it.
--
-- `mode` is 'edit' for a window that is saving, and 'view' for one opened
-- read-only or one that stopped saving after a clash. Only 'edit' rows raise
-- the warning. Deleting the project takes its rows along.
CREATE TABLE IF NOT EXISTS "video_editor_windows" (
  "project_id" varchar(36) NOT NULL
    REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "window_id" varchar(36) NOT NULL,
  "mode" varchar(8) NOT NULL,
  "opened_at" timestamptz NOT NULL,
  "seen_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "window_id"),
  CONSTRAINT "video_editor_windows_mode_check" CHECK ("mode" in ('edit', 'view'))
);
