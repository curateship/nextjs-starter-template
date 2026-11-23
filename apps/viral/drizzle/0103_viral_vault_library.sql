-- The vault's board, the Library page, storage clean-up and winning ads.
--
-- viral_formats keeps a winning structure saved from an analysis (Library →
-- Formats). Formats belong to the person, so one saved in one project writes
-- scripts in every project. viral_format_scripts keeps each script written
-- from a format. viral_hook_tags puts the person's own tags on a hook in the
-- Library. last_opened_at says when a saved video was last opened, so Storage
-- clean-up can find copies nobody has opened for 30 days. meta_token is the
-- Meta ad library token on Settings → Meta, kept scrambled. viral_ads keeps
-- each project's last Winning ads search, and viral_ad_runs when it ran.
--
-- Task: workspace/tasks/features/01-viral-features.md, parts 15 to 19 and 23.

CREATE TABLE IF NOT EXISTS "viral_formats" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "parts" jsonb NOT NULL,
  "source_title" text,
  "is_sample" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_viral_formats_owner" ON "viral_formats" ("owner_id", "created_at");

CREATE TABLE IF NOT EXISTS "viral_format_scripts" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "format_id" varchar(36) NOT NULL REFERENCES "viral_formats"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "viral_projects"("id") ON DELETE SET NULL,
  "idea" text NOT NULL,
  "script" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_viral_format_scripts_format" ON "viral_format_scripts" ("format_id", "created_at");

CREATE TABLE IF NOT EXISTS "viral_hook_tags" (
  "saved_video_id" varchar(36) NOT NULL REFERENCES "viral_videos"("id") ON DELETE CASCADE,
  "tag_id" varchar(36) NOT NULL REFERENCES "viral_tags"("id") ON DELETE CASCADE,
  PRIMARY KEY ("saved_video_id", "tag_id")
);
CREATE INDEX IF NOT EXISTS "ix_viral_hook_tags_tag" ON "viral_hook_tags" ("tag_id");

ALTER TABLE "viral_videos" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone;

ALTER TABLE "viral_settings" ADD COLUMN IF NOT EXISTS "meta_token" text;

CREATE TABLE IF NOT EXISTS "viral_ads" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  "ad_archive_id" varchar(64) NOT NULL,
  "page_name" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "title" text NOT NULL DEFAULT '',
  "keyword" text NOT NULL DEFAULT '',
  "platforms" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "started_at" timestamp with time zone NOT NULL,
  "found_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_ads_project_ad" ON "viral_ads" ("project_id", "ad_archive_id");

CREATE TABLE IF NOT EXISTS "viral_ad_runs" (
  "project_id" varchar(36) PRIMARY KEY REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  "searched_at" timestamp with time zone NOT NULL,
  "error" text
);
