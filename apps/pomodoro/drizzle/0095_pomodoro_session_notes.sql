-- One line about what the focus was for, written straight after it finishes.
--
-- A column on the session rather than a table of its own: a note belongs to
-- exactly one session, is written once, and is read on every row of the
-- History table, so a join would buy nothing.
--
-- 120 characters is the cap. It is one line in a table cell, not a journal,
-- and the limit is what keeps the History row readable at a glance.
--
-- Nothing else selects it. The admin sessions dashboard names its columns one
-- by one (`listAdminSessions` in src/server/pomodoro/admin.ts) and this is not
-- among them, so a note stays with the person who wrote it.
ALTER TABLE "focus_sessions"
  ADD COLUMN IF NOT EXISTS "note" varchar(120);
