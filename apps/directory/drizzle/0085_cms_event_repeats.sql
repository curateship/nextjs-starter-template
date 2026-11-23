-- Repeating events: weekly on chosen days, or monthly like "first Tuesday".
--
-- The main event holds the rule in `repeat_rule` and is itself the first
-- date. Every later date is its own row, with its own page, pointing back at
-- the main event through `series_id`. `series_date` is the day the rule made
-- it for, so the same day is never made twice, even by two jobs at once.
--
-- `edited_alone` is set when an admin saves one date by itself. Changes to
-- the main event then skip that date. `repeat_made_until` is the last day the
-- rule has been worked through, so a date the admin deleted is never made
-- again.
--
-- Deleting the main event deletes every one of its dates.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "repeat_rule" jsonb;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "repeat_made_until" date;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "series_id" varchar(36);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "series_date" date;
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "edited_alone" boolean NOT NULL DEFAULT false;

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_series_id_fkey";
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "events"("id") ON DELETE CASCADE;

-- A date has both halves or neither, and a date never holds a rule itself.
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_series_date_check";
ALTER TABLE "events" ADD CONSTRAINT "events_series_date_check"
  CHECK (("series_id" IS NULL) = ("series_date" IS NULL));
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_series_rule_check";
ALTER TABLE "events" ADD CONSTRAINT "events_series_rule_check"
  CHECK ("series_id" IS NULL OR "repeat_rule" IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_events_series_date"
  ON "events" ("series_id", "series_date");
