-- A host's own limit on how many people their room holds (10 Oct 2026,
-- Tyler: the room card's cog holds the countdown and "room users limit").
-- Null is no limit of the room's own; the admin's site-wide limit in
-- Settings → App settings → Rooms still applies on top, and the lower wins.
-- Lowering it never takes anybody out; it only refuses the next person.
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "max_people" integer;
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_max_people_check";
ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_max_people_check"
  CHECK ("max_people" IS NULL OR "max_people" BETWEEN 2 AND 500);
