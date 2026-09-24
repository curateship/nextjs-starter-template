-- Featured events.
--
-- An admin features an event for free with a switch in the event's window,
-- stored on the event. A repeating event keeps the switch on its main event
-- only, and its dates follow it.
--
-- A listing's owner can pay to feature an event they sent in, through the
-- same plans, checkouts and placements as a featured listing. A placement is
-- now for exactly one thing: a listing or an event. The two id columns say
-- which, and a check makes sure one is set and the other is empty. The tables
-- keep their names, because renaming a stored table is a change every old
-- query and backup has to follow.

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false;

-- A plan sells spots on listings or on events, never both. An event's spot
-- lasts until the event ends, so an event plan has no number of days.
ALTER TABLE "directory_featured_plans"
  ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'listing';

ALTER TABLE "directory_featured_plans"
  ALTER COLUMN "duration_days" DROP NOT NULL;

ALTER TABLE "directory_featured_plans"
  DROP CONSTRAINT IF EXISTS "directory_featured_plans_duration_check";

ALTER TABLE "directory_featured_plans"
  ADD CONSTRAINT "directory_featured_plans_duration_check"
    CHECK (
      ("kind" = 'listing' AND "duration_days" BETWEEN 1 AND 3650)
      OR ("kind" = 'event' AND "duration_days" IS NULL)
    );

ALTER TABLE "directory_featured_plans"
  ADD CONSTRAINT "directory_featured_plans_kind_check"
    CHECK ("kind" IN ('listing', 'event'));

-- An open checkout for an event. Deleting the event is refused while one is
-- open, the same as a listing, so a payment can never land on nothing.
ALTER TABLE "directory_featured_checkouts"
  ALTER COLUMN "listing_id" DROP NOT NULL;

ALTER TABLE "directory_featured_checkouts"
  ALTER COLUMN "duration_days" DROP NOT NULL;

ALTER TABLE "directory_featured_checkouts"
  ADD COLUMN IF NOT EXISTS "event_id" varchar(36)
    REFERENCES "events"("id") ON DELETE RESTRICT;

ALTER TABLE "directory_featured_checkouts"
  ADD CONSTRAINT "directory_featured_checkouts_subject_check"
    CHECK (("listing_id" IS NULL) <> ("event_id" IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_featured_checkouts_event"
  ON "directory_featured_checkouts" ("workspace_id", "event_id");

-- A paid spot on an event. Deleting the event deletes it, the same as a
-- listing's.
ALTER TABLE "directory_featured_entitlements"
  ALTER COLUMN "listing_id" DROP NOT NULL;

ALTER TABLE "directory_featured_entitlements"
  ADD COLUMN IF NOT EXISTS "event_id" varchar(36)
    REFERENCES "events"("id") ON DELETE CASCADE;

ALTER TABLE "directory_featured_entitlements"
  ADD CONSTRAINT "directory_featured_entitlements_subject_check"
    CHECK (("listing_id" IS NULL) <> ("event_id" IS NULL));

CREATE INDEX IF NOT EXISTS "ix_directory_featured_entitlements_event_active"
  ON "directory_featured_entitlements" ("event_id", "status", "ends_at");
