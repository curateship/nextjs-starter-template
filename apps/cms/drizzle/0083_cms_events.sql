-- Events: dated happenings an admin writes for one site, and the site's time
-- zone that says what their times mean.
--
-- An event is a post with a when and a where: a title, an address under
-- /events/, a cover image, a summary, a written body, a start and an optional
-- end, and a place. The body is the same editor tree a post holds, cleaned by
-- `lib/posts/post-body.ts`.
--
-- The start and end are stored as a date and a local clock time, never as one
-- moment in time. "Saturday 6pm" stays Saturday 6pm when the clocks change, and
-- when the site's time zone is changed, because the zone is read when the time
-- is used, not baked in when it is saved.
--
-- Categories are not a column here. An event is filed through the shared
-- `category_relationships` table with `content_type = 'event'`.
CREATE TABLE IF NOT EXISTS "events" (
  "id" varchar(36) PRIMARY KEY,
  -- Deleting a site deletes its events.
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  -- The address part after /events/, unique within one site.
  "slug" varchar(160) NOT NULL,
  -- A media-library URL, or empty.
  "cover_image" varchar(600) NOT NULL DEFAULT '',
  "summary" varchar(300) NOT NULL DEFAULT '',
  "body" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  -- 'draft' or 'published'. A draft is never readable by a visitor.
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  -- Set the first time the event is published and kept after that.
  "published_at" timestamptz,
  -- The day and the site's own clock time it starts.
  "start_date" date NOT NULL,
  "start_time" time NOT NULL,
  -- Both empty for an event with no end, which counts as over when its start
  -- day is over. An end time always comes with an end date, so an event that
  -- runs past midnight says which day it finishes on.
  "end_date" date,
  "end_time" time,
  -- Where it happens. Both may be empty while the event is a draft.
  "place_name" varchar(200) NOT NULL DEFAULT '',
  "place_address" varchar(300) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "events_status_check"
    CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "events_published_has_date_check"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL),
  CONSTRAINT "events_end_time_has_date_check"
    CHECK ("end_time" IS NULL OR "end_date" IS NOT NULL),
  -- The end is never before the start.
  CONSTRAINT "events_end_after_start_check"
    CHECK (
      "end_date" IS NULL
      OR "end_date" > "start_date"
      OR ("end_date" = "start_date" AND ("end_time" IS NULL OR "end_time" > "start_time"))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_events_workspace_slug"
  ON "events" ("workspace_id", "slug");

-- Admin → Events and the later Events page both read one site's events by date.
CREATE INDEX IF NOT EXISTS "ix_events_workspace_status_start"
  ON "events" ("workspace_id", "status", "start_date");

-- The site's time zone. Every site, old and new, starts on Toronto time: the
-- one real site is in Toronto, and a site elsewhere changes it in
-- Settings → Directory.
ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "time_zone" varchar(64) NOT NULL
    DEFAULT 'America/Toronto';
