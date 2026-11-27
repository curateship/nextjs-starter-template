-- Content's own tables (workspace/docs/content-app.md).
--
-- content_sample_made: the sample project is made once per person, the first
-- time their Projects list is read, and never again once they delete it.
CREATE TABLE IF NOT EXISTS "content_sample_made" (
  "owner_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "made_at" timestamp with time zone NOT NULL
);

-- content_navigation_added: which menus Content's left menu was written into,
-- and whether the home page was set, so each happens once and an admin's own
-- changes afterwards are kept.
CREATE TABLE IF NOT EXISTS "content_navigation_added" (
  "scope" varchar(120) PRIMARY KEY NOT NULL,
  "added_at" timestamp with time zone NOT NULL
);
