-- Creator watch: watched creators get their newest reels auto-ingested, and
-- engagement stats are re-captured over time for trending velocity.
ALTER TABLE "creators"
  ADD COLUMN "watch" boolean NOT NULL DEFAULT false,
  ADD COLUMN "last_checked_at" timestamptz;

CREATE TABLE "viral_video_stats" (
  "id" varchar(36) PRIMARY KEY,
  "video_id" varchar(36) NOT NULL REFERENCES "viral_videos"("id") ON DELETE CASCADE,
  "captured_at" timestamptz NOT NULL,
  "views" bigint,
  "likes" bigint,
  "comments" bigint
);

CREATE INDEX "ix_viral_video_stats_video_captured"
  ON "viral_video_stats" ("video_id", "captured_at");

-- Seed one snapshot per existing video from its download-time stats so the
-- first re-sync already yields a velocity.
INSERT INTO "viral_video_stats" ("id", "video_id", "captured_at", "views", "likes", "comments")
SELECT
  gen_random_uuid()::varchar,
  v."id",
  v."created_at",
  nullif(v."stats"->>'views', '')::bigint,
  nullif(v."stats"->>'likes', '')::bigint,
  nullif(v."stats"->>'comments', '')::bigint
FROM "viral_videos" v
WHERE v."stats" IS NOT NULL;
