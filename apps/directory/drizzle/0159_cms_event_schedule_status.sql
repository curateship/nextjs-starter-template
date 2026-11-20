-- Cancelled or postponed events (task events/27, 19 Nov 2026).
--
-- events.schedule_status: whether the event is going ahead. 'scheduled',
-- 'cancelled' or 'postponed'. Apart from `status`, which is draft or
-- published: a published event can be cancelled, and stays on the site with
-- a banner. Postponed means no new date yet (Tyler: "New date unknown").
--
-- events.rescheduled_from_date and rescheduled_from_time: where a postponed or
-- cancelled event was before the admin gave it a new date, for the page's
-- "Rescheduled from" note and Google's previousStartDate. Null otherwise.
--
-- events.notice and events.notice_number: what everybody on the event's list
-- must be told ('cancelled', 'postponed', 'rescheduled' or 'back-on'), and a
-- number that goes up by one each time the schedule status really changes.
-- Saving the same status twice leaves it alone.
--
-- event_sign_ups.told_notice: the notice number this person was last emailed
-- about. The background pass emails everybody whose number is behind the
-- event's, so each change is sent once (Tyler: "Signed up + waiting", so the
-- waiting list is told too). A new sign-up starts at the event's number.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "schedule_status" varchar(20) NOT NULL DEFAULT 'scheduled';
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_schedule_status_check";
ALTER TABLE "events" ADD CONSTRAINT "events_schedule_status_check" CHECK ("schedule_status" IN ('scheduled', 'cancelled', 'postponed'));
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "rescheduled_from_date" date;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "rescheduled_from_time" time;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "notice" varchar(20);
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_notice_check";
ALTER TABLE "events" ADD CONSTRAINT "events_notice_check" CHECK ("notice" IS NULL OR "notice" IN ('cancelled', 'postponed', 'rescheduled', 'back-on'));
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "notice_number" integer NOT NULL DEFAULT 0;

ALTER TABLE "event_sign_ups" ADD COLUMN IF NOT EXISTS "told_notice" integer NOT NULL DEFAULT 0;
