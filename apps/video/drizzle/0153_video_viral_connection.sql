-- Send to Video from the Viral app (apps/viral/workspace/tasks/viral-research/
-- 01-viral-research-app.md, part 21; workspace/docs/viral-connection.md):
-- the key Viral calls Video with, every send Viral makes, and what a sent
-- draft carries. Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "viral_script" text;
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "viral_notes" text;
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "viral_vault_url" varchar(600);

CREATE TABLE IF NOT EXISTS "video_viral_links" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "key_hash" varchar(64) NOT NULL UNIQUE,
  "key_secret" text NOT NULL,
  "viral_url" varchar(500) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "video_viral_arrivals" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Viral's own id for the send, so the same send twice makes one draft.
  "send_id" varchar(64) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "video_id" varchar(36) REFERENCES "video_project_videos"("id") ON DELETE SET NULL,
  "replacing" boolean NOT NULL DEFAULT false,
  -- copying, ready or failed.
  "status" varchar(8) NOT NULL,
  "error" text NOT NULL DEFAULT '',
  "pending" jsonb NOT NULL,
  "media_id" varchar(36),
  "claimed_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_arrivals_send" ON "video_viral_arrivals" ("user_id", "send_id");
CREATE INDEX IF NOT EXISTS "ix_video_viral_arrivals_status" ON "video_viral_arrivals" ("status", "claimed_at");
