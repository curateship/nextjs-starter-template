-- The Viral app's own tables (src/server/viral/schema.ts).
--
-- The research tables are Video's Viral section, copied with video_viral_*
-- renamed viral_* (Tyler, 4 Nov 2026: "Copy it, remove later"). Favourites
-- were left behind, because the vault replaces them. New here: projects carry
-- a topic and their socials; the channel figures behind the Outlier sort; one
-- row per Analyse with AI; the vault with its tags; and the sends to Video.
--
-- Task: workspace/tasks/viral-research/01-viral-research-app.md.

CREATE TABLE IF NOT EXISTS "viral_creators" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "handle" varchar(100) NOT NULL,
  "platform_channel_id" varchar(100),
  "display_name" text,
  "follower_count" bigint,
  "avatar_storage_path" text,
  "profile_url" text NOT NULL,
  "watch" boolean NOT NULL DEFAULT true,
  "last_checked_at" timestamp with time zone,
  "source" varchar(20),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_creators_owner_platform_handle" ON "viral_creators" ("owner_id", "platform", (lower("handle")));
CREATE INDEX IF NOT EXISTS "ix_viral_creators_watch" ON "viral_creators" ("watch", "last_checked_at");

CREATE TABLE IF NOT EXISTS "viral_project_folders" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "name" varchar(120) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_project_folders_owner_name" ON "viral_project_folders" ("owner_id", (lower("name")));

CREATE TABLE IF NOT EXISTS "viral_projects" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "folder_id" varchar(36),
  "name" varchar(200) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "topic" text NOT NULL DEFAULT '',
  "socials" jsonb NOT NULL DEFAULT '["youtube","tiktok"]'::jsonb,
  "paused_socials" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_video_project_id" varchar(36),
  "watch_run_at" timestamp with time zone,
  "days" integer NOT NULL DEFAULT 30,
  "min_views" bigint NOT NULL DEFAULT 0,
  "min_score" integer NOT NULL DEFAULT 0,
  "video_length" varchar(10) NOT NULL DEFAULT 'shorts',
  "spend_limit_cents" integer,
  "units_spent" integer NOT NULL DEFAULT 0,
  "cover_url" text,
  "is_sample" boolean NOT NULL DEFAULT false,
  "pinned_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("folder_id") REFERENCES "viral_project_folders"("id") ON DELETE SET NULL,
  CONSTRAINT "ck_viral_projects_length" CHECK ("video_length" in ('shorts', 'long', 'both')),
  CONSTRAINT "ck_viral_projects_days" CHECK ("days" in (7, 30, 90))
);
CREATE INDEX IF NOT EXISTS "ix_viral_projects_owner_updated" ON "viral_projects" ("owner_id", "updated_at");

CREATE TABLE IF NOT EXISTS "viral_videos" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "source_url" text NOT NULL,
  "status" varchar(20) NOT NULL,
  "wants_analysis" boolean NOT NULL DEFAULT true,
  "error" text,
  "media_id" varchar(36),
  "thumbnail_storage_path" text,
  "title" text,
  "channel_name" text,
  "channel_id" varchar(100),
  "subscribers" bigint,
  "duration_seconds" integer,
  "views" bigint,
  "likes" bigint,
  "comments" bigint,
  "posted_at" timestamp with time zone,
  "breakdown" jsonb,
  "pending_analysis" jsonb,
  "analysis_error" text,
  "lease_token" varchar(36),
  "lease_expires_at" timestamp with time zone,
  "viral_project_id" varchar(36),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL,
  FOREIGN KEY ("viral_project_id") REFERENCES "viral_projects"("id") ON DELETE SET NULL,
  CONSTRAINT "ck_viral_videos_status" CHECK ("status" in ('waiting', 'downloading', 'downloaded', 'analysing', 'ready', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_videos_owner_video" ON "viral_videos" ("owner_id", "platform", "platform_video_id");
CREATE INDEX IF NOT EXISTS "ix_viral_videos_status" ON "viral_videos" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "viral_creator_posts" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "creator_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "url" text NOT NULL,
  "title" text,
  "thumbnail_url" text,
  "duration_seconds" integer,
  "views" bigint,
  "likes" bigint,
  "comments" bigint,
  "posted_at" timestamp with time zone,
  "first_seen_at" timestamp with time zone NOT NULL,
  "thumbnail_storage_path" text,
  "cover_checked_at" timestamp with time zone,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("creator_id") REFERENCES "viral_creators"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_creator_posts_owner_video" ON "viral_creator_posts" ("owner_id", "platform", "platform_video_id");
CREATE INDEX IF NOT EXISTS "ix_viral_creator_posts_feed" ON "viral_creator_posts" ("owner_id", "posted_at");
CREATE INDEX IF NOT EXISTS "ix_viral_creator_posts_creator" ON "viral_creator_posts" ("creator_id", "posted_at");

CREATE TABLE IF NOT EXISTS "viral_project_keywords" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL,
  "keyword" varchar(100) NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'idle',
  "error" text,
  "lease_token" varchar(36),
  "lease_expires_at" timestamp with time zone,
  "queued_at" timestamp with time zone,
  "ran_at" timestamp with time zone,
  "units_spent" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  CONSTRAINT "ck_viral_project_keywords_status" CHECK ("status" in ('idle', 'queued', 'searching', 'done', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_project_keywords_project_keyword" ON "viral_project_keywords" ("project_id", (lower("keyword")));
CREATE INDEX IF NOT EXISTS "ix_viral_project_keywords_status" ON "viral_project_keywords" ("status", "queued_at");

CREATE TABLE IF NOT EXISTS "viral_project_results" (
  "id" varchar(36) PRIMARY KEY,
  "keyword_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "url" text NOT NULL,
  "title" text NOT NULL,
  "channel_id" varchar(100) NOT NULL,
  "channel_name" text NOT NULL,
  "subscribers" bigint,
  "views" bigint NOT NULL,
  "likes" bigint,
  "comments" bigint,
  "posted_at" timestamp with time zone,
  "duration_seconds" integer NOT NULL,
  "thumbnail_url" text,
  "is_new" boolean NOT NULL DEFAULT false,
  "topic_match" integer,
  "found_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("keyword_id") REFERENCES "viral_project_keywords"("id") ON DELETE CASCADE,
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_project_results_keyword_video" ON "viral_project_results" ("keyword_id", "platform_video_id");
CREATE INDEX IF NOT EXISTS "ix_viral_project_results_project" ON "viral_project_results" ("project_id");

CREATE TABLE IF NOT EXISTS "viral_project_hidden_channels" (
  "project_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "channel_id" varchar(100) NOT NULL,
  "channel_name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("project_id", "platform", "channel_id"),
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "viral_project_creators" (
  "project_id" varchar(36) NOT NULL,
  "creator_id" varchar(36) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("project_id", "creator_id"),
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  FOREIGN KEY ("creator_id") REFERENCES "viral_creators"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ix_viral_project_creators_creator" ON "viral_project_creators" ("creator_id");

CREATE TABLE IF NOT EXISTS "viral_project_links" (
  "project_id" varchar(36) NOT NULL,
  "saved_video_id" varchar(36) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("project_id", "saved_video_id"),
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  FOREIGN KEY ("saved_video_id") REFERENCES "viral_videos"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ix_viral_project_links_saved_video" ON "viral_project_links" ("saved_video_id");

CREATE TABLE IF NOT EXISTS "viral_youtube_unit_spend" (
  "id" varchar(36) PRIMARY KEY,
  "units" integer NOT NULL,
  "reason" varchar(40) NOT NULL,
  "spent_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_viral_youtube_unit_spend_spent_at" ON "viral_youtube_unit_spend" ("spent_at");

CREATE TABLE IF NOT EXISTS "viral_settings" (
  "id" varchar(20) PRIMARY KEY,
  "youtube_api_key" text,
  "video_url" text NOT NULL DEFAULT '',
  "video_key" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "viral_channel_usual" (
  "owner_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "channel_id" varchar(100) NOT NULL,
  "typical_views" bigint,
  "sample_size" integer NOT NULL,
  "recent_views" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "worked_out_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("owner_id", "platform", "channel_id"),
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "viral_notified_videos" (
  "project_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "notified_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("project_id", "platform", "platform_video_id"),
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "viral_analyses" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "saved_video_id" varchar(36) NOT NULL,
  "project_id" varchar(36),
  "topic" text NOT NULL,
  "pieces" jsonb NOT NULL,
  "notes" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("saved_video_id") REFERENCES "viral_videos"("id") ON DELETE CASCADE,
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "ix_viral_analyses_saved_video" ON "viral_analyses" ("saved_video_id", "created_at");

CREATE TABLE IF NOT EXISTS "viral_vault_items" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "saved_video_id" varchar(36),
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "source_url" text NOT NULL,
  "title" text NOT NULL,
  "channel_name" text NOT NULL DEFAULT '',
  "media_id" varchar(36),
  "thumbnail_url" text,
  "thumbnail_storage_path" text,
  "stats" jsonb NOT NULL,
  "analysis_topic" text,
  "analysis" jsonb,
  "notes" text NOT NULL DEFAULT '',
  "status" varchar(10) NOT NULL DEFAULT 'idea',
  "sent_video_id" varchar(36),
  "sent_edit_url" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  FOREIGN KEY ("saved_video_id") REFERENCES "viral_videos"("id") ON DELETE SET NULL,
  FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL,
  CONSTRAINT "ck_viral_vault_items_status" CHECK ("status" in ('idea', 'scripted', 'sent', 'posted'))
);
CREATE INDEX IF NOT EXISTS "ix_viral_vault_items_owner" ON "viral_vault_items" ("owner_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_viral_vault_items_project" ON "viral_vault_items" ("project_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_vault_items_project_video" ON "viral_vault_items" ("project_id", "platform", "platform_video_id");

CREATE TABLE IF NOT EXISTS "viral_tags" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "name" varchar(40) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_tags_owner_name" ON "viral_tags" ("owner_id", (lower("name")));

CREATE TABLE IF NOT EXISTS "viral_vault_item_tags" (
  "item_id" varchar(36) NOT NULL,
  "tag_id" varchar(36) NOT NULL,
  PRIMARY KEY ("item_id", "tag_id"),
  FOREIGN KEY ("item_id") REFERENCES "viral_vault_items"("id") ON DELETE CASCADE,
  FOREIGN KEY ("tag_id") REFERENCES "viral_tags"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ix_viral_vault_item_tags_tag" ON "viral_vault_item_tags" ("tag_id");

CREATE TABLE IF NOT EXISTS "viral_sends" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "item_id" varchar(36) NOT NULL,
  "video_project_id" varchar(36) NOT NULL,
  "replacing" boolean NOT NULL DEFAULT false,
  "status" varchar(10) NOT NULL,
  "token_hash" varchar(64),
  "token_expires_at" timestamp with time zone,
  "video_id" varchar(36),
  "edit_url" text,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("item_id") REFERENCES "viral_vault_items"("id") ON DELETE CASCADE,
  CONSTRAINT "ck_viral_sends_status" CHECK ("status" in ('sending', 'copying', 'ready', 'failed'))
);
CREATE INDEX IF NOT EXISTS "ix_viral_sends_item" ON "viral_sends" ("item_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_sends_token" ON "viral_sends" ("token_hash");

CREATE TABLE IF NOT EXISTS "viral_navigation_added" (
  "scope" varchar(80) PRIMARY KEY,
  "added_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "viral_sample_made" (
  "owner_id" varchar(36) PRIMARY KEY,
  "made_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
);
