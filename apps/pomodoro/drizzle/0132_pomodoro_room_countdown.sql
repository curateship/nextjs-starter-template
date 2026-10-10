-- "Starting in" for every hosted room (9 Oct 2026). Tyler: "there should be a
-- default timer of 5 seconds for hosted room for everyone until they change
-- it", and joining a waiting room "should obey the starting in... timer".
--
-- `start_delay_seconds` is the host's choice, 5 seconds until they pick 1 to
-- 5 minutes. Pressing Start sets `starting_at` and copies the choice into
-- `countdown_seconds`; the room clock starts the focus at `starting_at`. Any
-- phase change clears both. A room counting down a minute or more shows under
-- "Starting soon"; a 5-second one does not.
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "start_delay_seconds" integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "starting_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "countdown_seconds" integer;
DO $$ BEGIN
  ALTER TABLE "rooms" ADD CONSTRAINT "rooms_start_delay_check"
    CHECK ("start_delay_seconds" IN (5, 60, 120, 180, 240, 300));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "rooms_starting_idx" ON "rooms" ("starting_at") WHERE "starting_at" IS NOT NULL;
