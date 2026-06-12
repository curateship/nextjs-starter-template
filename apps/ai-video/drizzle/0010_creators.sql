CREATE TABLE IF NOT EXISTS "creators" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "platform" varchar(20) NOT NULL,
  "username" varchar(255) NOT NULL,
  "display_name" varchar(255),
  "avatar_storage_path" varchar(500),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "creators_platform_check" CHECK ("platform" in ('tiktok', 'instagram')),
  CONSTRAINT "creators_user_platform_username_unique" UNIQUE ("user_id", "platform", "username")
);

CREATE INDEX IF NOT EXISTS "ix_creators_user_id" ON "creators" ("user_id");

ALTER TABLE "viral_videos" ADD COLUMN IF NOT EXISTS "creator_id" varchar(36) REFERENCES "creators"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_viral_videos_creator_id" ON "viral_videos" ("creator_id");

-- Backfill creators from existing archive rows. Instagram rows store the display
-- name in "author"; the stable handle lives in the title ("Video by {handle}").
INSERT INTO "creators" ("id", "user_id", "platform", "username", "display_name", "created_at", "updated_at")
SELECT
  gen_random_uuid()::varchar,
  "user_id",
  "platform",
  lower(coalesce(substring("title" from '^Video by (.+)$'), "author")),
  max("author"),
  now(),
  now()
FROM "viral_videos"
WHERE "author" IS NOT NULL
GROUP BY "user_id", "platform", lower(coalesce(substring("title" from '^Video by (.+)$'), "author"))
ON CONFLICT ("user_id", "platform", "username") DO NOTHING;

-- Link existing reels to their backfilled creators using the same key derivation.
UPDATE "viral_videos" v
SET "creator_id" = c."id"
FROM "creators" c
WHERE v."creator_id" IS NULL
  AND v."author" IS NOT NULL
  AND c."user_id" = v."user_id"
  AND c."platform" = v."platform"
  AND c."username" = lower(coalesce(substring(v."title" from '^Video by (.+)$'), v."author"));
