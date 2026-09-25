-- Which workspace somebody is in stops being a flag on the workspace.
--
-- It used to be `workspaces.is_default`, one row per user marked true, with a
-- partial unique index keeping it to one. That worked while a workspace
-- belonged to one person. It cannot survive workspaces being shared:
--
--   * Switching wrote `is_default = false` across every row with that user_id,
--     so two admins sharing a workspace would clear each other's choice.
--   * A workspace nobody owns still carried whatever flag the departed owner
--     left on it.
--   * The flag lives on the thing being pointed at, so it can only ever record
--     one person's opinion of it.
--
-- It becomes a pointer on the person instead: `users.current_workspace_id`.
-- Each person points wherever they like, nobody's choice touches anybody
-- else's, and the workspace itself stops carrying an opinion about who is
-- looking at it.
--
-- ON DELETE SET NULL, so deleting a workspace leaves the people who were in it
-- pointing at nothing rather than at a row that is gone. Pointing at nothing is
-- a state the code has to handle anyway — a brand new account is in exactly
-- that state until it picks one.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "current_workspace_id" varchar(36);

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_current_workspace_id_workspaces_id_fk";

ALTER TABLE "users"
  ADD CONSTRAINT "users_current_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("current_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL;

-- Carry over what each person was already in, so nobody is moved by this.
UPDATE "users"
SET "current_workspace_id" = (
  SELECT "w"."id" FROM "workspaces" "w"
  WHERE "w"."user_id" = "users"."id" AND "w"."is_default"
  LIMIT 1
)
WHERE "current_workspace_id" IS NULL;

-- Anybody who owned workspaces but had none marked gets the oldest, which is
-- what the old code fell back to when it found no flag.
UPDATE "users"
SET "current_workspace_id" = (
  SELECT "w"."id" FROM "workspaces" "w"
  WHERE "w"."user_id" = "users"."id"
  ORDER BY "w"."created_at" ASC
  LIMIT 1
)
WHERE "current_workspace_id" IS NULL;

DROP INDEX IF EXISTS "ux_workspaces_one_default_per_user";

ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "is_default";

-- Reading somebody's current workspace happens on every signed-in page load.
CREATE INDEX IF NOT EXISTS "ix_users_current_workspace" ON "users" ("current_workspace_id");

-- An automation run records which workspace it is for, when it starts.
--
-- The engine used to work it out from the flow owner's *current* workspace
-- every time it woke up (`executors.ts`, `send-email.ts`). So whoever owned a
-- flow could switch workspace and silently change who that flow emails —
-- including a run that was already part way through. A run's audience must not
-- be able to change under it.
--
-- Nullable, because runs that already exist started before this column did and
-- there is nothing truthful to fill them with; the engine falls back to the
-- owner's workspace for those and only those.
ALTER TABLE "automation_runs"
  ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

ALTER TABLE "automation_runs" DROP CONSTRAINT IF EXISTS "automation_runs_workspace_id_workspaces_id_fk";

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "ix_automation_runs_workspace" ON "automation_runs" ("workspace_id");
