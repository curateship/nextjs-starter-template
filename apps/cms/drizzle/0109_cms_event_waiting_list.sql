-- A waiting list when an event is full.
--
-- When every seat is taken, a visitor joins a queue instead of being turned
-- away. When a seat frees up the person at the front is emailed a link that
-- claims it, and the seat is held for them until the link runs out. An offer
-- nobody claims passes to the next person, and the one who missed it comes off
-- the list.
--
-- Three new statuses on the same table, because a person on the waiting list
-- is the same person with the same name and email, in a different state:
--
--   waiting   in the queue, holding no seat
--   offered   a seat is being held for them until 'offer_expires_at'
--   expired   the hold ran out, so they are off the list
--
-- An offered row holds a seat. That is the whole point: the seat is taken off
-- the public count the moment it is offered, or the next visitor would take it
-- out from under the person who was just emailed.

ALTER TABLE "event_sign_ups"
  DROP CONSTRAINT IF EXISTS "event_sign_ups_status_check";

ALTER TABLE "event_sign_ups"
  ADD CONSTRAINT "event_sign_ups_status_check"
    CHECK ("status" IN ('confirmed', 'waiting', 'offered', 'expired', 'cancelled'));

-- The claim link's secret, kept as a hash, exactly as the directory's
-- "confirm your email" links are. It is kept after the offer is claimed or
-- runs out, so clicking an old link is answered with what happened to that
-- offer rather than "we do not recognise this link". Only a row that is still
-- 'offered' can be claimed, so a kept token opens nothing.
ALTER TABLE "event_sign_ups"
  ADD COLUMN IF NOT EXISTS "offer_token_hash" varchar(64);

ALTER TABLE "event_sign_ups"
  ADD COLUMN IF NOT EXISTS "offer_expires_at" timestamptz;

-- The two offer columns are set together or not at all, and a row that is
-- still offered always has them. A kept token on a claimed or expired row is
-- how an old link is answered in words.
ALTER TABLE "event_sign_ups"
  ADD CONSTRAINT "event_sign_ups_offer_check"
    CHECK (
      ("offer_token_hash" IS NULL) = ("offer_expires_at" IS NULL)
      AND ("status" <> 'offered' OR "offer_token_hash" IS NOT NULL)
    );

-- One live row per email per event, now counting the queue as well. Somebody
-- waiting cannot join twice, and somebody holding an offer cannot start a
-- second one. A removed or expired row is not live, so that email may come
-- back while a seat is free.
DROP INDEX IF EXISTS "ux_event_sign_ups_live_email";

CREATE UNIQUE INDEX IF NOT EXISTS "ux_event_sign_ups_live_email"
  ON "event_sign_ups" ("event_id", "email")
  WHERE "status" IN ('confirmed', 'waiting', 'offered');

-- The background pass asks two questions every fifteen seconds: which holds
-- have run out, and which events have somebody waiting. Each one gets the
-- small partial index that answers it without reading the table.
CREATE INDEX IF NOT EXISTS "ix_event_sign_ups_offer_expiry"
  ON "event_sign_ups" ("offer_expires_at")
  WHERE "status" = 'offered';

CREATE INDEX IF NOT EXISTS "ix_event_sign_ups_waiting"
  ON "event_sign_ups" ("event_id", "created_at")
  WHERE "status" = 'waiting';
