-- Free sign-ups for an event.
--
-- An admin switches sign-ups on in the event's window and may set a number of
-- seats. A visitor signs up with a name and an email, no account. Sign-ups
-- close when the event starts.
--
-- Each date of a repeating event is its own event, so each date has its own
-- seats and its own list.

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "takes_sign_ups" boolean NOT NULL DEFAULT false;

-- Null for no limit.
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "seats" integer;

ALTER TABLE "events"
  ADD CONSTRAINT "events_seats_check"
    CHECK ("seats" IS NULL OR "seats" BETWEEN 1 AND 100000);

-- One row per sign-up. Removing someone marks the row cancelled rather than
-- deleting it, which frees the seat. Deleting the event deletes its sign-ups.
CREATE TABLE IF NOT EXISTS "event_sign_ups" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "event_id" varchar(36) NOT NULL
    REFERENCES "events"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "email" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'confirmed',
  "created_at" timestamptz NOT NULL,
  "cancelled_at" timestamptz,
  CONSTRAINT "event_sign_ups_status_check"
    CHECK ("status" IN ('confirmed', 'cancelled')),
  CONSTRAINT "event_sign_ups_cancelled_check"
    CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL))
);

-- One live sign-up per email per event. A removed person's row is cancelled,
-- so they can sign up again while a seat is free.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_event_sign_ups_live_email"
  ON "event_sign_ups" ("event_id", "email")
  WHERE "status" = 'confirmed';

CREATE INDEX IF NOT EXISTS "ix_event_sign_ups_event"
  ON "event_sign_ups" ("event_id", "status", "created_at");
