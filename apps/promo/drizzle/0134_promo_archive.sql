-- The Archive (Video's task promo/01-send-to-promo-and-archive.md): videos,
-- carousels and pictures kept by project, sent from the Video app or
-- uploaded, and the key Video sends them with. Additions only. Nothing
-- stored is renamed or dropped.

CREATE TABLE IF NOT EXISTS "promo_video_links" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  -- The key's hash, to find who is calling, and the key scrambled, for Copy.
  "key_hash" varchar(64) NOT NULL UNIQUE,
  "key_secret" text NOT NULL,
  -- The Video address that last pressed Test. Files are fetched from it only.
  "video_url" varchar(500) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "promo_archive_items" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  -- video, carousel or picture.
  "kind" varchar(10) NOT NULL,
  -- copying while files come across, then ready.
  "status" varchar(10) NOT NULL DEFAULT 'copying',
  "title" varchar(200) NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "caption" text NOT NULL DEFAULT '',
  -- Write captions' words per network, after any edit.
  "captions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "aspect" varchar(8) NOT NULL DEFAULT '',
  "width" integer,
  "height" integer,
  "duration_ms" integer,
  "file_size" bigint NOT NULL DEFAULT 0,
  "storage_path" text NOT NULL DEFAULT '',
  "mime_type" varchar(100) NOT NULL DEFAULT '',
  "cover_path" text NOT NULL DEFAULT '',
  "pdf_path" text NOT NULL DEFAULT '',
  "subtitles" text NOT NULL DEFAULT '',
  -- video or upload.
  "source" varchar(10) NOT NULL,
  -- An upload's media library file. Its file belongs to the media library,
  -- so deleting the item for good leaves it there.
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "send_id" varchar(64),
  "video_export_id" varchar(64) NOT NULL DEFAULT '',
  "video_project_id" varchar(64) NOT NULL DEFAULT '',
  "video_project_name" varchar(200) NOT NULL DEFAULT '',
  "video_edit_url" varchar(600) NOT NULL DEFAULT '',
  -- Language copies, or a carousel and its slideshow, share a key.
  "group_key" varchar(64) NOT NULL DEFAULT '',
  "language" varchar(40) NOT NULL DEFAULT '',
  -- The files still to fetch while copying.
  "pending" jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "claimed_at" timestamptz,
  "pinned_at" timestamptz,
  -- In the Bin since then; gone for good 30 days later.
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_archive_items_project" ON "promo_archive_items" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_archive_items_user" ON "promo_archive_items" ("user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_archive_items_send" ON "promo_archive_items" ("user_id", "send_id");

CREATE TABLE IF NOT EXISTS "promo_archive_slides" (
  "id" varchar(36) PRIMARY KEY,
  "item_id" varchar(36) NOT NULL REFERENCES "promo_archive_items"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  -- photo or video.
  "kind" varchar(10) NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "file_size" bigint NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_archive_slides_position" ON "promo_archive_slides" ("item_id", "position");

-- A draft waiting in a network's post writer, from a network ticked in
-- Video's send window.
CREATE TABLE IF NOT EXISTS "promo_archive_drafts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_id" varchar(36) NOT NULL REFERENCES "promo_archive_items"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "network" varchar(20) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "used_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_archive_drafts_item" ON "promo_archive_drafts" ("item_id", "network");
CREATE INDEX IF NOT EXISTS "ix_promo_archive_drafts_project" ON "promo_archive_drafts" ("project_id", "network");

-- Which archive item each post was made from, for the posted marks.
ALTER TABLE "promo_app_posts" ADD COLUMN IF NOT EXISTS "archive_item_id" varchar(36) REFERENCES "promo_archive_items"("id") ON DELETE SET NULL;
ALTER TABLE "promo_linkedin_posts" ADD COLUMN IF NOT EXISTS "archive_item_id" varchar(36) REFERENCES "promo_archive_items"("id") ON DELETE SET NULL;
ALTER TABLE "promo_x_posts" ADD COLUMN IF NOT EXISTS "archive_item_id" varchar(36) REFERENCES "promo_archive_items"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "ix_promo_app_posts_archive" ON "promo_app_posts" ("archive_item_id") WHERE "archive_item_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_posts_archive" ON "promo_linkedin_posts" ("archive_item_id") WHERE "archive_item_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_promo_x_posts_archive" ON "promo_x_posts" ("archive_item_id") WHERE "archive_item_id" IS NOT NULL;

-- The Archive dashboard in the left menu, under Projects right after
-- Accounts (Tyler, 4 Nov 2026: "Under Projects"), and last among Projects'
-- children where there is no Accounts. A sidebar that already links to
-- /admin/archive, or has no Projects entry, is left alone.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') <> 'array' THEN "s"."section"
        ELSE jsonb_set(
          "s"."section",
          '{entries}',
          COALESCE(
            (
              SELECT jsonb_agg(
                CASE
                  WHEN "e"."entry"->>'href' = '/admin/projects' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    (
                      WITH "kids" AS (
                        SELECT "c"."child", "c"."ord"
                        FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof("e"."entry"->'children') = 'array'
                            THEN "e"."entry"->'children' ELSE '[]'::jsonb END
                        ) WITH ORDINALITY AS "c"("child", "ord")
                      ),
                      "at" AS (
                        SELECT COALESCE(
                          (SELECT "ord" FROM "kids" WHERE "child"->>'href' = '/admin/accounts' LIMIT 1),
                          (SELECT COALESCE(max("ord"), 0) FROM "kids")
                        ) AS "ord"
                      )
                      SELECT COALESCE(jsonb_agg("item" ORDER BY "pos"), '[]'::jsonb)
                      FROM (
                        SELECT "child" AS "item", "ord"::numeric AS "pos" FROM "kids"
                        UNION ALL
                        SELECT jsonb_build_object(
                          'id', 'item-promo-archive',
                          'href', '/admin/archive',
                          'label', 'Archive',
                          'visible', true
                        ), "ord" + 0.5 FROM "at"
                      ) AS "merged"
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              )
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
            ),
            '[]'::jsonb
          )
        )
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord")
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/projects")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/archive")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/archive")');
