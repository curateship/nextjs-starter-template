-- Finding winners: Rising fast, the New mark, top comments, trending sounds
-- and the "same idea" search (src/server/viral/schema.ts).
--
-- viral_view_history keeps one views figure per video per day, so a video
-- whose views at least doubled since the day before can say so (Tyler, 4 Nov
-- 2026: "Doubled in a day"). Views are public numbers, so the rows are per
-- video, not per person.
-- viral_seen_videos is who has opened which video, so New clears for that
-- person alone when they open it (Tyler: "Opening that video").
-- viral_video_comments keeps a video's 20 most-liked comments for a day, so
-- opening it again costs nothing (Tyler: "20 comments only").
-- viral_same_idea keeps the last "same idea, other creators" search for one
-- video in one project.
-- viral_creator_posts gains the TikTok sound's name and who made it.
--
-- Task: workspace/tasks/features/01-viral-features.md, parts 2, 3, 8, 9, 10.

CREATE TABLE IF NOT EXISTS "viral_view_history" (
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "day" date NOT NULL,
  "views" bigint NOT NULL,
  PRIMARY KEY ("platform", "platform_video_id", "day")
);

CREATE TABLE IF NOT EXISTS "viral_seen_videos" (
  "user_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "seen_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("user_id", "platform", "platform_video_id"),
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "viral_video_comments" (
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "comments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "disabled" boolean NOT NULL DEFAULT false,
  "read_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("platform", "platform_video_id")
);

CREATE TABLE IF NOT EXISTS "viral_same_idea" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "search_line" text NOT NULL,
  "results" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "units" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL,
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("project_id") REFERENCES "viral_projects"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_same_idea_project_video" ON "viral_same_idea" ("project_id", "platform", "platform_video_id");

ALTER TABLE "viral_creator_posts" ADD COLUMN IF NOT EXISTS "sound_name" text;
ALTER TABLE "viral_creator_posts" ADD COLUMN IF NOT EXISTS "sound_artist" text;
