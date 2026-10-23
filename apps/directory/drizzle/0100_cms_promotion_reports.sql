-- Problems visitors spot on a deal, in the same table and queue as the ones
-- they spot on a listing or an event.
--
-- A report is about exactly one thing: a listing, an event or a deal. The
-- three id columns say which, and the check makes sure exactly one is set.

-- Deleting a deal deletes its reports, the same as a listing or an event.
ALTER TABLE "directory_listing_reports"
  ADD COLUMN IF NOT EXISTS "promotion_id" varchar(36)
    REFERENCES "promotions"("id") ON DELETE CASCADE;

ALTER TABLE "directory_listing_reports"
  DROP CONSTRAINT IF EXISTS "directory_listing_reports_subject_check";

ALTER TABLE "directory_listing_reports"
  ADD CONSTRAINT "directory_listing_reports_subject_check"
    CHECK (
      ("listing_id" IS NOT NULL)::int
      + ("event_id" IS NOT NULL)::int
      + ("promotion_id" IS NOT NULL)::int = 1
    );

-- Each kind has its own reasons. "other" is on every list.
ALTER TABLE "directory_listing_reports"
  DROP CONSTRAINT IF EXISTS "directory_listing_reports_reason_check";

ALTER TABLE "directory_listing_reports"
  ADD CONSTRAINT "directory_listing_reports_reason_check"
    CHECK (
      ("listing_id" IS NOT NULL
        AND "reason" IN ('wrong_hours', 'wrong_contact', 'closed', 'other'))
      OR ("event_id" IS NOT NULL
        AND "reason" IN ('wrong_time', 'cancelled', 'wrong_place', 'other'))
      OR ("promotion_id" IS NOT NULL
        AND "reason" IN ('not_honoured', 'ended', 'wrong_details', 'other'))
    );

CREATE INDEX IF NOT EXISTS "ix_directory_listing_reports_promotion"
  ON "directory_listing_reports" ("promotion_id");
