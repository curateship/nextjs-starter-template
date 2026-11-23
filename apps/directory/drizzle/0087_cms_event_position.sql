-- Where an event is on a map, for the small map on its page.
--
-- A typed street address is looked up with Google once, when it is saved, and
-- the answer is kept here. `located_for` is the address that was looked up,
-- so saving again without changing it makes no second lookup, and an address
-- Google could not find is not asked about again. An event held at a listing
-- uses the listing's own position instead, and these stay empty.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "longitude" numeric(10, 6);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "located_for" varchar(300);

-- A position is a whole pair or nothing, never a made-up 0,0.
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_position_pair_check";
ALTER TABLE "events" ADD CONSTRAINT "events_position_pair_check"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
