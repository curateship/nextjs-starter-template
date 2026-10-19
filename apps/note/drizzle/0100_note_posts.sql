-- Posts: X posts a person saved, the folders they sort them into, the one
-- line about themselves every plan is written for, and which bell notice is
-- about which post.
--
-- Everything is per person except the settings row, which is the app's. Each
-- per-person table points at the person who owns it and goes with them when
-- the account is deleted.

-- A flat list of folders, the same shape as the Videos folders and kept apart
-- from them, so a post folder and a video folder never share a name rule or a
-- count. Posts folders have no fields (Tyler, 19 Oct 2026).
CREATE TABLE IF NOT EXISTS "note_post_folders" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_post_folders_owner_name"
  ON "note_post_folders" ("owner_id", lower("name"));

-- One saved post, or one plan merged from several (kind 'merged'). The status
-- is the job: the `note-posts` worker claims a row by its status and a lease,
-- and every write it makes checks the lease is still its own. The post's
-- video has a status of its own, because it downloads after the words.
CREATE TABLE IF NOT EXISTS "note_posts" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "folder_id" varchar(36) REFERENCES "note_post_folders" ("id") ON DELETE SET NULL,
  "kind" varchar(10) NOT NULL DEFAULT 'post',
  -- X's own number for the post. Null on a merged plan.
  "post_id" varchar(30),
  "url" text,
  "status" varchar(20) NOT NULL,
  "error" text,
  "author_name" text,
  "author_handle" varchar(30),
  "author_picture_path" text,
  "posted_at" timestamptz,
  -- The words with X's short links opened back up.
  "text" text,
  -- [{ path, width, height }], stored in the bucket at save time.
  "pictures" jsonb,
  -- { postId, url, authorName, authorHandle, text, postedAt, pictures }.
  "quoted" jsonb,
  -- The author's follow-on posts, in order: [{ postId, text, pictures }].
  "thread" jsonb,
  -- none, whole, or cut when the rest of the thread could not be read.
  "thread_status" varchar(10) NOT NULL DEFAULT 'none',
  "article_url" text,
  "article_title" text,
  "article_text" text,
  "likes_when_saved" integer,
  "reposts_when_saved" integer,
  -- none, waiting, downloading, saved, failed or too_long.
  "video_status" varchar(20) NOT NULL DEFAULT 'none',
  "video_error" text,
  "video_source_url" text,
  "video_seconds" integer,
  "video_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "video_cover_path" text,
  -- [{ startMs, endMs, text }]: what was said in the video, written at Analyse.
  "transcript" jsonb,
  -- [{ part, start, end }] over the post's own words.
  "highlights" jsonb,
  -- [string], in English.
  "summary" jsonb,
  -- [{ text, done, from? }]. The ticks and the words are the person's own.
  "action_plan" jsonb,
  -- [string], lowercase.
  "tags" jsonb,
  "suggested_folder_id" varchar(36) REFERENCES "note_post_folders" ("id") ON DELETE SET NULL,
  "similar_post_id" varchar(36) REFERENCES "note_posts" ("id") ON DELETE SET NULL,
  -- The posts a merged plan was made from. Deleting one leaves the plan as it is.
  "source_post_ids" jsonb,
  "analysed_at" timestamptz,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ck_note_posts_kind" CHECK ("kind" IN ('post', 'merged')),
  CONSTRAINT "ck_note_posts_status" CHECK (
    "status" IN ('waiting', 'reading', 'saved', 'queued', 'analysing', 'ready', 'failed')
  ),
  CONSTRAINT "ck_note_posts_video_status" CHECK (
    "video_status" IN ('none', 'waiting', 'downloading', 'saved', 'failed', 'too_long')
  ),
  CONSTRAINT "ck_note_posts_thread_status" CHECK ("thread_status" IN ('none', 'whole', 'cut'))
);

-- Saving the same post twice is one row. The number is read off the link, so
-- the index catches a second paste at once.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_posts_owner_post"
  ON "note_posts" ("owner_id", "post_id")
  WHERE "post_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_note_posts_status"
  ON "note_posts" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_note_posts_owner_created"
  ON "note_posts" ("owner_id", "created_at");

-- The app's own settings, one row. `about_you` is the line every post's plan
-- is written for (Tyler, 19 Oct 2026: "One line for the whole app").
CREATE TABLE IF NOT EXISTS "note_settings" (
  "key" varchar(20) PRIMARY KEY,
  "about_you" text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL
);

-- A bell notice can be about a post too. Deleting either side takes the link,
-- and a notice is still about exactly one thing.
ALTER TABLE "note_notice_links"
  ADD COLUMN IF NOT EXISTS "post_id" varchar(36) REFERENCES "note_posts" ("id") ON DELETE CASCADE;
ALTER TABLE "note_notice_links" DROP CONSTRAINT IF EXISTS "ck_note_notice_links_one";
ALTER TABLE "note_notice_links"
  ADD CONSTRAINT "ck_note_notice_links_one" CHECK (num_nonnulls("video_id", "note_id", "post_id") = 1);
