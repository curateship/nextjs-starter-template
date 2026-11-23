-- Parts 6, 7, 8 and 10 of the "More Viral features" task
-- (workspace/tasks/features/02-more-viral-features.md, workspace/docs/library.md,
-- workspace/docs/winning-ads.md).
--
-- Part 7, hook types. Tyler, 6 Nov 2026: "Fixed + my own". A hook's type is
-- one of the seven fixed ones in "hook_type", or one of the person's own in
-- "hook_type_id", never both. Deleting an own type sets "hook_type_id" back to
-- NULL through the foreign key, so its hooks go back to no type.
CREATE TABLE IF NOT EXISTS "viral_hook_types" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(40) NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_hook_types_owner_name" ON "viral_hook_types" ("owner_id", lower("name"));

ALTER TABLE "viral_videos" ADD COLUMN IF NOT EXISTS "hook_type" varchar(20);
ALTER TABLE "viral_videos" ADD COLUMN IF NOT EXISTS "hook_type_id" varchar(36) REFERENCES "viral_hook_types"("id") ON DELETE SET NULL;
ALTER TABLE "viral_videos" DROP CONSTRAINT IF EXISTS "ck_viral_videos_hook_type";
ALTER TABLE "viral_videos"
  ADD CONSTRAINT "ck_viral_videos_hook_type" CHECK (
    ("hook_type" IS NULL OR "hook_type" in ('question', 'mistake', 'list', 'bold-claim', 'story', 'shocking-number', 'how-to'))
    AND ("hook_type" IS NULL OR "hook_type_id" IS NULL)
  );

-- Part 8, your own hook. Tyler: "Words, link, tags". It belongs to the
-- person, not one project, so it shows under All projects. The link is kept
-- only when it starts with http or https.
CREATE TABLE IF NOT EXISTS "viral_own_hooks" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "words" text NOT NULL,
  "link" text,
  "hook_type" varchar(20),
  "hook_type_id" varchar(36) REFERENCES "viral_hook_types"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_viral_own_hooks_hook_type" CHECK (
    ("hook_type" IS NULL OR "hook_type" in ('question', 'mistake', 'list', 'bold-claim', 'story', 'shocking-number', 'how-to'))
    AND ("hook_type" IS NULL OR "hook_type_id" IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS "ix_viral_own_hooks_owner" ON "viral_own_hooks" ("owner_id", "created_at");

CREATE TABLE IF NOT EXISTS "viral_own_hook_tags" (
  "own_hook_id" varchar(36) NOT NULL REFERENCES "viral_own_hooks"("id") ON DELETE CASCADE,
  "tag_id" varchar(36) NOT NULL REFERENCES "viral_tags"("id") ON DELETE CASCADE,
  PRIMARY KEY ("own_hook_id", "tag_id")
);
CREATE INDEX IF NOT EXISTS "ix_viral_own_hook_tags_tag" ON "viral_own_hook_tags" ("tag_id");

-- Part 6, Write hooks like this. Tyler: "Kept under the hook". Each press
-- keeps five hooks under the hook they were written from: an analysed
-- video's or your own, never both. Deleting either deletes them.
CREATE TABLE IF NOT EXISTS "viral_hook_ideas" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "saved_video_id" varchar(36) REFERENCES "viral_videos"("id") ON DELETE CASCADE,
  "own_hook_id" varchar(36) REFERENCES "viral_own_hooks"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "viral_projects"("id") ON DELETE SET NULL,
  "hooks" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_viral_hook_ideas_source" CHECK (num_nonnulls("saved_video_id", "own_hook_id") = 1)
);
CREATE INDEX IF NOT EXISTS "ix_viral_hook_ideas_video" ON "viral_hook_ideas" ("saved_video_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_viral_hook_ideas_own" ON "viral_hook_ideas" ("own_hook_id", "created_at");

-- Part 10, Write an ad like this. Tyler: "Meta's three boxes". A new ads
-- search replaces viral_ads, so a written ad is kept by the project and the
-- ad's library id instead, with no key on the ad's row.
CREATE TABLE IF NOT EXISTS "viral_ad_copies" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  "ad_archive_id" varchar(64) NOT NULL,
  "main_text" text NOT NULL,
  "headline" text NOT NULL,
  "description" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_viral_ad_copies_ad" ON "viral_ad_copies" ("project_id", "ad_archive_id", "created_at");
