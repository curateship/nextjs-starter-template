-- Viral becomes projects (task viral-projects/01). A project is one niche: a
-- name, a description and up to ten keywords. Searching runs every keyword as
-- its own background job, and the results belong to the keyword that found
-- them. The Creators page folds in: a creator folder becomes a project and
-- the folder tables go.

-- ------------------------------------------------------------ Folders -----
-- Viral's own folders, apart from the editor's, so the two lists never mix.
CREATE TABLE IF NOT EXISTS "video_viral_project_folders" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_project_folders_owner_name"
  ON "video_viral_project_folders" ("owner_id", lower("name"));

-- ----------------------------------------------------------- Projects -----
-- `days`, `video_length` and the keywords are what YouTube is asked. Minimum
-- views and minimum score are applied when the results are read, so changing
-- them costs nothing. `units_spent` adds up every YouTube unit the project's
-- searches and creator look-ups ever used.
CREATE TABLE IF NOT EXISTS "video_viral_projects" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "folder_id" varchar(36) REFERENCES "video_viral_project_folders"("id") ON DELETE SET NULL,
  "name" varchar(200) NOT NULL,
  "description" text NOT NULL DEFAULT '',
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
  CONSTRAINT "ck_video_viral_projects_length"
    CHECK ("video_length" IN ('shorts', 'long', 'both')),
  CONSTRAINT "ck_video_viral_projects_days" CHECK ("days" IN (7, 30, 90))
);
CREATE INDEX IF NOT EXISTS "ix_video_viral_projects_owner_updated"
  ON "video_viral_projects" ("owner_id", "updated_at");

-- ----------------------------------------------------------- Keywords -----
-- One keyword of one project, and the job that searches it. The status row
-- is the job: Search marks it `queued`, the worker claims it with a lease and
-- takes it to `done` or `failed`, and a restart puts an abandoned claim back.
CREATE TABLE IF NOT EXISTS "video_viral_project_keywords" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "video_viral_projects"("id") ON DELETE CASCADE,
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
  CONSTRAINT "ck_video_viral_project_keywords_status"
    CHECK ("status" IN ('idle', 'queued', 'searching', 'done', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_project_keywords_project_keyword"
  ON "video_viral_project_keywords" ("project_id", lower("keyword"));
CREATE INDEX IF NOT EXISTS "ix_video_viral_project_keywords_status"
  ON "video_viral_project_keywords" ("status", "queued_at");

-- ------------------------------------------------------------ Results -----
-- One video one keyword found. `is_new` is set when the keyword's search
-- writes it: true when the project did not have the video before that search.
-- `topic_match` is the AI's 0 to 100 for how well the title fits the
-- project's description, null until it has been asked.
CREATE TABLE IF NOT EXISTS "video_viral_project_results" (
  "id" varchar(36) PRIMARY KEY,
  "keyword_id" varchar(36) NOT NULL REFERENCES "video_viral_project_keywords"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_viral_projects"("id") ON DELETE CASCADE,
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
  "found_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_project_results_keyword_video"
  ON "video_viral_project_results" ("keyword_id", "platform_video_id");
CREATE INDEX IF NOT EXISTS "ix_video_viral_project_results_project"
  ON "video_viral_project_results" ("project_id");

-- ---------------------------------------------------- Hidden channels -----
CREATE TABLE IF NOT EXISTS "video_viral_project_hidden_channels" (
  "project_id" varchar(36) NOT NULL REFERENCES "video_viral_projects"("id") ON DELETE CASCADE,
  "platform" varchar(20) NOT NULL,
  "channel_id" varchar(100) NOT NULL,
  "channel_name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("project_id", "platform", "channel_id")
);

-- ----------------------------------------------------------- Creators -----
-- Which followed creators belong to which project. A creator row is stored
-- once, so the watch timer checks them once whatever number of projects they
-- are in.
CREATE TABLE IF NOT EXISTS "video_viral_project_creators" (
  "project_id" varchar(36) NOT NULL REFERENCES "video_viral_projects"("id") ON DELETE CASCADE,
  "creator_id" varchar(36) NOT NULL REFERENCES "video_creators"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("project_id", "creator_id")
);
CREATE INDEX IF NOT EXISTS "ix_video_viral_project_creators_creator"
  ON "video_viral_project_creators" ("creator_id");

-- -------------------------------------------------------- Collections -----
-- Favourites. A collection belongs to one person and holds videos from any
-- project. Each item keeps its own copy of the video's details, so a re-run
-- that replaces a keyword's results, or deleting the project it came from,
-- never empties a collection.
CREATE TABLE IF NOT EXISTS "video_viral_collections" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_collections_owner_name"
  ON "video_viral_collections" ("owner_id", lower("name"));

CREATE TABLE IF NOT EXISTS "video_viral_collection_items" (
  "collection_id" varchar(36) NOT NULL REFERENCES "video_viral_collections"("id") ON DELETE CASCADE,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "url" text NOT NULL,
  "title" text NOT NULL,
  "channel_id" varchar(100) NOT NULL,
  "channel_name" text NOT NULL,
  "subscribers" bigint,
  "views" bigint,
  "likes" bigint,
  "comments" bigint,
  "posted_at" timestamp with time zone,
  "duration_seconds" integer,
  "thumbnail_url" text,
  "source_project_id" varchar(36) REFERENCES "video_viral_projects"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("collection_id", "platform", "platform_video_id")
);

-- ------------------------------------------------------ YouTube units -----
-- Every YouTube call the app makes, so a run can be refused before it starts
-- when today's free 10,000 units would not cover it. The allowance belongs to
-- the API key, which is the whole app's, so the ledger has no owner.
CREATE TABLE IF NOT EXISTS "video_youtube_unit_spend" (
  "id" varchar(36) PRIMARY KEY,
  "units" integer NOT NULL,
  "reason" varchar(40) NOT NULL,
  "spent_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_video_youtube_unit_spend_spent_at"
  ON "video_youtube_unit_spend" ("spent_at");

-- ------------------------------------------------- Links from elsewhere ---
-- The editor project Copy this made from a Viral project, and the saved video
-- a Viral project asked to have broken down (its AI cost counts against the
-- project's spend limit).
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "source_viral_project_id" varchar(36)
  REFERENCES "video_viral_projects"("id") ON DELETE SET NULL;
ALTER TABLE "video_viral_videos" ADD COLUMN IF NOT EXISTS "viral_project_id" varchar(36)
  REFERENCES "video_viral_projects"("id") ON DELETE SET NULL;

-- ---------------------------------------------- Moving what was there ----
-- Each person's saved one-keyword searches become one project called
-- "Earlier searches", every keyword kept with its results, so nothing found
-- before is lost. Then the old tables go.
CREATE TEMP TABLE "viral_earlier_projects" AS
  SELECT owners."owner_id", gen_random_uuid()::varchar(36) AS "project_id"
  FROM (SELECT DISTINCT "owner_id" FROM "video_viral_searches") owners;

INSERT INTO "video_viral_projects" ("id", "owner_id", "name", "description", "days", "created_at", "updated_at")
SELECT p."project_id", p."owner_id", 'Earlier searches',
  'The keywords searched on the old Viral page, one keyword at a time.', 30, now(), now()
FROM "viral_earlier_projects" p;

INSERT INTO "video_viral_project_keywords" ("id", "project_id", "keyword", "position", "status", "ran_at", "units_spent", "created_at")
SELECT s."id", p."project_id", s."keyword",
  (row_number() OVER (PARTITION BY s."owner_id" ORDER BY s."ran_at") - 1)::int,
  'done', s."ran_at", s."units_spent", s."created_at"
FROM "video_viral_searches" s
JOIN "viral_earlier_projects" p ON p."owner_id" = s."owner_id";

INSERT INTO "video_viral_project_results" ("id", "keyword_id", "project_id", "platform", "platform_video_id", "url", "title", "channel_id", "channel_name", "subscribers", "views", "likes", "comments", "posted_at", "duration_seconds", "thumbnail_url", "found_at")
SELECT r."id", r."search_id", k."project_id", r."platform", r."platform_video_id", r."url", r."title", r."channel_id", r."channel_name", r."subscribers", r."views", r."likes", r."comments", r."posted_at", r."duration_seconds", r."thumbnail_url", k."ran_at"
FROM "video_viral_results" r
JOIN "video_viral_project_keywords" k ON k."id" = r."search_id";

UPDATE "video_viral_projects" p
SET "units_spent" = (
  SELECT coalesce(sum(k."units_spent"), 0) FROM "video_viral_project_keywords" k
  WHERE k."project_id" = p."id"
)
WHERE p."id" IN (SELECT "project_id" FROM "viral_earlier_projects");

DROP TABLE IF EXISTS "video_viral_results";
DROP TABLE IF EXISTS "video_viral_searches";

-- Each creator folder becomes a project with the folder's name and its
-- creators, and anyone followed but in no folder goes into one project
-- called "Followed creators". Saved and broken-down videos never belonged to
-- a folder, so they stay as they are.
INSERT INTO "video_viral_projects" ("id", "owner_id", "name", "created_at", "updated_at")
SELECT f."id", f."owner_id", f."name", f."created_at", now()
FROM "video_creator_folders" f;

INSERT INTO "video_viral_project_creators" ("project_id", "creator_id", "created_at")
SELECT fc."folder_id", fc."creator_id", now()
FROM "video_creator_folder_creators" fc;

CREATE TEMP TABLE "viral_loose_creator_projects" AS
  SELECT owners."owner_id", gen_random_uuid()::varchar(36) AS "project_id"
  FROM (
    SELECT DISTINCT c."owner_id"
    FROM "video_creators" c
    WHERE NOT EXISTS (
      SELECT 1 FROM "video_creator_folder_creators" fc WHERE fc."creator_id" = c."id"
    )
  ) owners;

INSERT INTO "video_viral_projects" ("id", "owner_id", "name", "created_at", "updated_at")
SELECT l."project_id", l."owner_id", 'Followed creators', now(), now()
FROM "viral_loose_creator_projects" l;

INSERT INTO "video_viral_project_creators" ("project_id", "creator_id", "created_at")
SELECT l."project_id", c."id", now()
FROM "video_creators" c
JOIN "viral_loose_creator_projects" l ON l."owner_id" = c."owner_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "video_creator_folder_creators" fc WHERE fc."creator_id" = c."id"
);

DROP TABLE IF EXISTS "video_creator_folder_creators";
DROP TABLE IF EXISTS "video_creator_folders";
DROP TABLE "viral_earlier_projects";
DROP TABLE "viral_loose_creator_projects";

-- ---------------------------------------------------------- The menu -----
-- The Creators link goes from every left menu. Matched by address rather
-- than id, the way 0113 removed links, so one somebody re-made by hand goes
-- too. Viral keeps its link.
WITH rebuilt AS (
  SELECT
    workspaces.id,
    jsonb_set(
      workspaces.settings,
      '{sections}',
      (
        SELECT jsonb_agg(
          jsonb_set(
            section,
            '{entries}',
            COALESCE((
              SELECT jsonb_agg(
                CASE
                  WHEN entry ? 'children' THEN
                    jsonb_set(
                      entry,
                      '{children}',
                      COALESCE(
                        (
                          SELECT jsonb_agg(child ORDER BY child_order)
                          FROM jsonb_array_elements(entry->'children')
                            WITH ORDINALITY AS children(child, child_order)
                          WHERE COALESCE(child->>'href', '') <> '/admin/video-creators'
                        ),
                        '[]'::jsonb
                      ),
                      true
                    )
                  ELSE entry
                END
                ORDER BY entry_order
              )
              FROM jsonb_array_elements(section->'entries')
                WITH ORDINALITY AS entries(entry, entry_order)
              WHERE COALESCE(entry->>'href', '') <> '/admin/video-creators'
            ), '[]'::jsonb),
            true
          )
          ORDER BY section_order
        )
        FROM jsonb_array_elements(workspaces.settings->'sections')
          WITH ORDINALITY AS sections(section, section_order)
      ),
      true
    ) AS settings
  FROM workspaces
  WHERE workspaces.settings::text LIKE '%/admin/video-creators%'
)
UPDATE workspaces
SET settings = rebuilt.settings,
    updated_at = now()
FROM rebuilt
WHERE workspaces.id = rebuilt.id;
