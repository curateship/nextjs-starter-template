-- Profile organization: folders, customizable workflow statuses, and tags.
-- Folders and statuses are per-user lookup tables; profiles reference them with
-- ON DELETE SET NULL so removing a folder/status just unsets it, never deletes
-- the profile. `tags` is an inline string array (one user has hundreds of
-- profiles — a jsonb array filtered client-side is plenty, no join table needed).

CREATE TABLE IF NOT EXISTS "profile_folders" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_profile_folders_user_id" ON "profile_folders" ("user_id");

CREATE TABLE IF NOT EXISTS "profile_statuses" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "color" varchar(20) NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_profile_statuses_user_id" ON "profile_statuses" ("user_id");

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "folder_id" varchar(36)
    REFERENCES "profile_folders"("id") ON DELETE SET NULL;
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "status_id" varchar(36)
    REFERENCES "profile_statuses"("id") ON DELETE SET NULL;
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
