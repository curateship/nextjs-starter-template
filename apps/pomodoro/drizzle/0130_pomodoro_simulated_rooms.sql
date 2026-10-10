-- Rooms the made-up members host and sit in (live activity task 02, 9 Oct 2026).
--
-- One row per open room a made-up account hosts, written the first time the
-- worker sees it, whether the worker opened it or a weekly rule booked it.
-- `focuses_run` counts the focuses the host has started, because made-up
-- rooms wait between rounds and the room's own step count cannot say. `featured`
-- says the worker, not an admin, set the room's featured_at, so the worker
-- only ever clears its own; `feature_declined` says an admin took that off,
-- so the worker never features this room again. Deleting the room deletes
-- the row.
CREATE TABLE IF NOT EXISTS "pomodoro_simulated_rooms" (
  "room_id" uuid PRIMARY KEY REFERENCES "rooms"("id") ON DELETE CASCADE,
  "host_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "focuses_run" integer NOT NULL DEFAULT 0,
  "focus_target" integer NOT NULL,
  "member_target" integer NOT NULL,
  "featured" boolean NOT NULL DEFAULT false,
  "feature_declined" boolean NOT NULL DEFAULT false,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pomodoro_simulated_rooms_host_idx"
  ON "pomodoro_simulated_rooms" ("host_user_id");

-- Remove all leaves a made-up host whose room still holds a real member, and
-- marks it here. The worker deletes it once the last real person has gone.
ALTER TABLE "pomodoro_simulated_accounts"
  ADD COLUMN IF NOT EXISTS "remove_requested_at" timestamp with time zone;
