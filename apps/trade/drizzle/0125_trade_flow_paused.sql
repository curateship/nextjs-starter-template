-- A switched-on flow that has been told to stop looking, without being stopped.
--
-- Pause and Stop are two different acts and the difference is money. Stopping
-- calls off the waiting ladders this flow placed; pausing calls off nothing at
-- all — every ladder and every position stays exactly where it is, and the flow
-- simply stops looking for new coins to add.
--
-- It stays `status = 'running'` on purpose, so it keeps holding its wallet: the
-- unique indexes that stop two flows trading one wallet are written on that
-- status, and a paused flow letting a second one in would be the double
-- position they exist to prevent.
ALTER TABLE "trade_flow_runs"
  ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
