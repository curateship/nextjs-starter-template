-- Events the public suggested, waiting for an admin to say yes or no.
--
-- A suggestion is not an event. It is a row of what somebody typed on the
-- site's Suggest an event page, and it becomes a draft event only when an
-- admin approves it, once, because `event_id` remembers what it became.
--
-- The day and times are the site's own calendar and clock, the same as an
-- event's. An end time earlier than the start time means the next day, which
-- is how a gig from 9pm to 1am is typed.
CREATE TABLE IF NOT EXISTS "event_submissions" (
  "id" varchar(36) PRIMARY KEY,
  -- Deleting a site deletes its suggestions.
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- 'pending', 'approved' or 'rejected'.
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "title" varchar(200) NOT NULL,
  "start_date" date NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time,
  "place_name" varchar(200) NOT NULL DEFAULT '',
  "place_address" varchar(300) NOT NULL DEFAULT '',
  "description" varchar(2000) NOT NULL DEFAULT '',
  -- Where the photo is held in the site's file storage until an admin
  -- decides. Approving files it in the Media library; rejecting deletes it.
  "photo_path" varchar(300),
  "photo_name" varchar(255),
  "photo_type" varchar(100),
  "photo_size" integer,
  "submitter_name" varchar(120) NOT NULL DEFAULT '',
  "submitter_email" varchar(255) NOT NULL,
  "reviewed_by_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "review_note" varchar(500) NOT NULL DEFAULT '',
  -- The draft event an approved suggestion became. Set once.
  "event_id" varchar(36)
    REFERENCES "events"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "event_submissions_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected')),
  -- A photo is the whole set of four or nothing.
  CONSTRAINT "event_submissions_photo_check"
    CHECK (
      ("photo_path" IS NULL) = ("photo_name" IS NULL)
      AND ("photo_path" IS NULL) = ("photo_type" IS NULL)
      AND ("photo_path" IS NULL) = ("photo_size" IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "ix_event_submissions_workspace_status"
  ON "event_submissions" ("workspace_id", "status", "created_at");
