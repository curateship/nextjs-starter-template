-- The Viral page keeps every search, so looking at yesterday's results costs
-- nothing. YouTube gives about 100 free searches a day (each one spends 102
-- of the 10,000 free units), and re-running a keyword just to look at it
-- again would waste them.
--
-- One row per keyword per platform per person: searching the same keyword
-- again updates the row (matched ignoring case, the way YouTube matches) and
-- replaces its results, rather than piling up copies. `days` and `min_views`
-- are the filters the search ran with, so Run again repeats exactly what was
-- asked. Deleting a search deletes its results through the foreign key.
--
-- Counts a channel hides (subscribers, likes, comments) are NULL, never zero.

CREATE TABLE IF NOT EXISTS "video_viral_searches" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "keyword" varchar(100) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "days" integer NOT NULL,
  "min_views" bigint NOT NULL,
  "ran_at" timestamp with time zone NOT NULL,
  "units_spent" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_viral_searches_owner"
  ON "video_viral_searches" ("owner_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_searches_owner_platform_keyword"
  ON "video_viral_searches" ("owner_id", "platform", lower("keyword"));

CREATE TABLE IF NOT EXISTS "video_viral_results" (
  "id" varchar(36) PRIMARY KEY,
  "search_id" varchar(36) NOT NULL REFERENCES "video_viral_searches"("id") ON DELETE CASCADE,
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
  "thumbnail_url" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_results_search_video"
  ON "video_viral_results" ("search_id", "platform_video_id");
