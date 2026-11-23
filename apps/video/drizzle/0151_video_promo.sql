-- Send to Promo (workspace/tasks/promo/01-send-to-promo-and-archive.md):
-- Promo's address and key on Settings → Promo, every send to a Promo
-- project, and the Promo projects last picked per video or carousel project.
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "promo_url" varchar(500) NOT NULL DEFAULT '';
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "promo_api_key" text;

CREATE TABLE IF NOT EXISTS "video_promo_sends" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- export, thumbnail or slideshow.
  "kind" varchar(12) NOT NULL,
  "export_id" varchar(36) REFERENCES "video_render_jobs"("id") ON DELETE SET NULL,
  "thumbnail_id" varchar(36),
  "source_project_id" varchar(36),
  "promo_project_id" varchar(64) NOT NULL,
  "promo_project_name" varchar(200) NOT NULL DEFAULT '',
  -- sending, sent or failed.
  "status" varchar(10) NOT NULL,
  "error" text NOT NULL DEFAULT '',
  "promo_item_id" varchar(64) NOT NULL DEFAULT '',
  "promo_item_url" varchar(600) NOT NULL DEFAULT '',
  -- The hash of the token Promo fetches the files with, good for two hours.
  "token_hash" varchar(64) UNIQUE,
  "token_expires_at" timestamptz,
  "bytes_done" bigint NOT NULL DEFAULT 0,
  "bytes_total" bigint NOT NULL DEFAULT 0,
  "options" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "finished_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ix_video_promo_sends_export" ON "video_promo_sends" ("user_id", "export_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_video_promo_sends_status" ON "video_promo_sends" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "video_promo_picks" (
  "source_project_id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "promo_project_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL
);
