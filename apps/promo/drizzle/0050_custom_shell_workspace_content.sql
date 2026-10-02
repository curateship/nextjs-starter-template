-- Announcements, media, feedback and the changelog belong to a workspace.
--
-- These four are the content an admin makes and a visitor reads, and until now
-- none of them said which site they were for. Announcements and the changelog
-- were app-wide; media and feedback were filed under the **person**, which is
-- not the same thing as a site and is why a shared library goes wrong quietly.
-- Six other tables — contacts, segments, broadcasts, templates, deliveries and
-- email settings — already carry this column, and this copies them exactly:
-- required, cascading on delete, with the indexes led by it.
--
-- **What happens to what already exists.** An app upgrading to this has one
-- workspace, so everything lands in it. Nothing is sorted — the rows are simply
-- assigned, because there is nothing in them that says which site they were
-- meant for. Where a deployment somehow has several workspaces already, a row
-- goes to the workspace its author is in, and to the oldest workspace when its
-- author is in none. That is a guess, and it is only ever made once.

-- Filled in below, then made required. Nullable first because there is no
-- single value to default them to.
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);
ALTER TABLE "changelog_entries" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

-- Media and feedback have an author, so they follow that person: the workspace
-- they are in, and the oldest workspace when they are in none — which is every
-- member, since only an admin is given one.
UPDATE "media" m
SET "workspace_id" = COALESCE(
  (SELECT u."current_workspace_id" FROM "users" u WHERE u."id" = m."user_id"),
  (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
)
WHERE m."workspace_id" IS NULL;

UPDATE "feedback" f
SET "workspace_id" = COALESCE(
  (SELECT u."current_workspace_id" FROM "users" u WHERE u."id" = f."user_id"),
  (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
)
WHERE f."workspace_id" IS NULL;

-- Announcements and changelog entries never recorded who wrote them, so the
-- oldest workspace is all there is to go on.
UPDATE "announcements"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

UPDATE "changelog_entries"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

-- A deployment with content but no workspace at all cannot happen — content is
-- made by somebody signed in, and signing in as an admin makes one — but if it
-- somehow did, those rows would still be null here and the next statement would
-- fail loudly rather than assign them somewhere invented.
ALTER TABLE "announcements" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "media" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "changelog_entries" ALTER COLUMN "workspace_id" SET NOT NULL;

-- Deleting a workspace takes its content with it, the same way it already takes
-- its contacts and broadcasts.
ALTER TABLE "announcements" DROP CONSTRAINT IF EXISTS "announcements_workspace_id_workspaces_id_fk";
ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_workspace_id_workspaces_id_fk";
ALTER TABLE "media"
  ADD CONSTRAINT "media_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "feedback_workspace_id_workspaces_id_fk";
ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "changelog_entries" DROP CONSTRAINT IF EXISTS "changelog_entries_workspace_id_workspaces_id_fk";
ALTER TABLE "changelog_entries"
  ADD CONSTRAINT "changelog_entries_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- Every one of these queries now starts by naming a workspace, so every index
-- leads with it. The old ones would still be read, but only after the workspace
-- had been narrowed some other way.
DROP INDEX IF EXISTS "ix_announcements_window";
CREATE INDEX IF NOT EXISTS "ix_announcements_workspace_window"
  ON "announcements" ("workspace_id", "starts_at", "ends_at");

DROP INDEX IF EXISTS "ix_changelog_entries_published_at";
CREATE INDEX IF NOT EXISTS "ix_changelog_entries_workspace_published"
  ON "changelog_entries" ("workspace_id", "published_at");

DROP INDEX IF EXISTS "ix_feedback_type";
CREATE INDEX IF NOT EXISTS "ix_feedback_workspace_created"
  ON "feedback" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_feedback_workspace_type"
  ON "feedback" ("workspace_id", "type");

-- The picker asks for one person's files on one site, newest first, so that is
-- the index. `ix_media_created_at` stays: the storage screen sorts every file
-- on the deployment by date and has no workspace to narrow by.
DROP INDEX IF EXISTS "ix_media_user_type_created";
CREATE INDEX IF NOT EXISTS "ix_media_workspace_user_created"
  ON "media" ("workspace_id", "user_id", "created_at");
