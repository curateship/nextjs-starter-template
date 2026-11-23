-- Scheduled rooms: a host books a start time, the room opens itself on that
-- time, and the people they typed in get an invite email.
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "starts_at" timestamp with time zone;

ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_phase_check";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_phase_check"
  CHECK ("phase" IN ('scheduled', 'waiting', 'focus', 'short', 'long', 'closed'));

ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_scheduled_starts_at_check";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_scheduled_starts_at_check"
  CHECK ("phase" <> 'scheduled' OR "starts_at" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "rooms_scheduled_idx" ON "rooms" ("phase", "starts_at");

CREATE TABLE IF NOT EXISTS "room_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "email" varchar(254) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "claimed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "failure_reason" varchar(200),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "room_invites_status_check" CHECK ("status" IN ('queued', 'sent', 'failed', 'cancelled')),
  CONSTRAINT "room_invites_room_email_unique" UNIQUE ("room_id", "email")
);
CREATE INDEX IF NOT EXISTS "room_invites_status_created_idx" ON "room_invites" ("status", "created_at");
