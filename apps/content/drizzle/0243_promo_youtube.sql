-- YouTube as a network (workspace/tasks/YouTube/01-youtube-features.md): the
-- videos and Shorts a channel uploaded, each project's description
-- templates, and YouTube's own number in Settings -> Behaviour.
--
-- Additions only. Nothing stored is renamed or dropped. A channel is a
-- promo_accounts row with platform 'youtube', in a browser profile or on a
-- phone; its subscribers and video count use the followers and post_count
-- columns the phone networks already have.

-- YouTube's own number in Settings -> Behaviour. No row means where it
-- begins: 3 uploads a day per channel (Tyler, 26 Nov 2026).
CREATE TABLE IF NOT EXISTS "promo_youtube_settings" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "uploads_per_day" integer NOT NULL DEFAULT 3,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- A description template: a named list of sections in order, each "fixed"
-- (words copied as typed) or "ai" (a part the AI writes, with a note saying
-- what belongs there). One project's own (Tyler: "Inside each project").
CREATE TABLE IF NOT EXISTS "promo_youtube_templates" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_youtube_templates_project" ON "promo_youtube_templates" ("project_id", "position");

-- One upload, a long video or a Short, from the press of Post to where it
-- landed and its numbers. Tried once and never again: a browser or phone that
-- stopped part-way may already have uploaded it.
CREATE TABLE IF NOT EXISTS "promo_youtube_posts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  -- The video by its address, from the media library or the Archive, as it
  -- was when Post was pressed.
  "media_url" varchar(2048) NOT NULL,
  "media_name" varchar(255) NOT NULL DEFAULT '',
  "archive_item_id" varchar(36) REFERENCES "promo_archive_items"("id") ON DELETE SET NULL,
  -- True when it goes up as a Short: tall or square, three minutes or less.
  "is_short" boolean NOT NULL DEFAULT false,
  "title" varchar(100) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- What the AI wrote before any edit, "" when written by hand.
  "draft_title" varchar(100) NOT NULL DEFAULT '',
  "draft_description" text NOT NULL DEFAULT '',
  "template_id" varchar(36) REFERENCES "promo_youtube_templates"("id") ON DELETE SET NULL,
  -- A picture from the media library or the Archive, or "" for YouTube's pick.
  "thumbnail_url" varchar(2048) NOT NULL DEFAULT '',
  -- Why the thumbnail did not take, in YouTube's or Promo's words, or "".
  "thumbnail_note" text NOT NULL DEFAULT '',
  -- The answer given to YouTube's "altered or synthetic content" question.
  "ai_made" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "post_url" varchar(600) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "job_id" varchar(36),
  "views" integer,
  "likes" integer,
  "comments" integer,
  "numbers_read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "posted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ix_promo_youtube_posts_project" ON "promo_youtube_posts" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_youtube_posts_account" ON "promo_youtube_posts" ("account_id", "created_at" DESC);
