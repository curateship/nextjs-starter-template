-- Problems visitors spot on an event, in the same table and queue as the ones
-- they spot on a listing.
--
-- A report is now about exactly one thing: a listing or an event. The two id
-- columns say which, and a check makes sure one of them is set and the other
-- is empty. The table keeps its name, because renaming a stored table is a
-- change every old query and backup has to follow.

ALTER TABLE "directory_listing_reports"
  ALTER COLUMN "listing_id" DROP NOT NULL;

-- Deleting an event deletes its reports, the same as a listing. Deleting a
-- repeating event's main date deletes every date, and their reports with them.
ALTER TABLE "directory_listing_reports"
  ADD COLUMN IF NOT EXISTS "event_id" varchar(36)
    REFERENCES "events"("id") ON DELETE CASCADE;

ALTER TABLE "directory_listing_reports"
  ADD CONSTRAINT "directory_listing_reports_subject_check"
    CHECK (("listing_id" IS NULL) <> ("event_id" IS NULL));

-- Each kind has its own reasons. "other" is on both lists.
ALTER TABLE "directory_listing_reports"
  DROP CONSTRAINT IF EXISTS "directory_listing_reports_reason_check";

ALTER TABLE "directory_listing_reports"
  ADD CONSTRAINT "directory_listing_reports_reason_check"
    CHECK (
      ("listing_id" IS NOT NULL
        AND "reason" IN ('wrong_hours', 'wrong_contact', 'closed', 'other'))
      OR ("event_id" IS NOT NULL
        AND "reason" IN ('wrong_time', 'cancelled', 'wrong_place', 'other'))
    );

CREATE INDEX IF NOT EXISTS "ix_directory_listing_reports_event"
  ON "directory_listing_reports" ("event_id");
