-- Event features of 19 Nov 2026 (task events/37).
--
-- tickets_url: where the event's tickets are sold, drawn as "Get tickets" on
-- the event page and sent to Google as the offer's address. Empty for none.
--
-- sign_ups_close_hours: how many hours before the start sign-ups close, set
-- on each event (Tyler: "On each event"). Null closes them when it starts.
--
-- sign_up_question and sign_up_question_required: one question of the
-- event's own under Email on the sign-up box, and whether it must be
-- answered (Tyler: "Admin picks per event"). An empty question shows none.
--
-- event_sign_ups.answer: what the person typed for that question.
--
-- event_submissions.changes_event_id: an owner asking to change an event
-- they sent, rather than sending a new one. Approving it writes the asked
-- fields onto that event. Deleting the event deletes the request.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tickets_url" varchar(600) NOT NULL DEFAULT '';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sign_ups_close_hours" integer;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sign_up_question" varchar(200) NOT NULL DEFAULT '';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sign_up_question_required" boolean NOT NULL DEFAULT false;
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_sign_ups_close_hours_check";
ALTER TABLE "events" ADD CONSTRAINT "events_sign_ups_close_hours_check" CHECK ("sign_ups_close_hours" IS NULL OR "sign_ups_close_hours" BETWEEN 1 AND 720);

ALTER TABLE "event_sign_ups" ADD COLUMN IF NOT EXISTS "answer" varchar(500) NOT NULL DEFAULT '';

ALTER TABLE "event_submissions" ADD COLUMN IF NOT EXISTS "changes_event_id" varchar(36) REFERENCES "events"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "ix_event_submissions_changes_event" ON "event_submissions" ("changes_event_id");
