-- Folders for projects: "Client A", "Weekly series", owned per person.
--
-- The same shape as media collections (0044), with one difference on purpose:
-- a project sits in at most one folder. The membership table's primary key is
-- the project alone, so the database itself refuses a second folder. A project
-- with no row here is in no folder.
--
-- The unique index is on the lowercased name so "client a" cannot sit beside
-- "Client A"; the server collapses whitespace before saving for the same reason.
CREATE TABLE IF NOT EXISTS "video_project_folders" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_project_folders_user_id"
  ON "video_project_folders" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_project_folders_user_name"
  ON "video_project_folders" ("user_id", lower("name"));

-- Membership. Deleting a folder deletes these rows and leaves every project in
-- it where it was, in no folder. Deleting a project takes its row along. Both
-- by cascade.
CREATE TABLE IF NOT EXISTS "video_project_folder_items" (
  "project_id" varchar(36) PRIMARY KEY
    REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "folder_id" varchar(36) NOT NULL
    REFERENCES "video_project_folders" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_project_folder_items_folder_id"
  ON "video_project_folder_items" ("folder_id");
