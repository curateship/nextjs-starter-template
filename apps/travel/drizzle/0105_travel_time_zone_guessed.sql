-- Travel features 4, part 1 (Tyler, 6 Nov 2026: "New trip + destination
-- change"): New trip fills in the trip's time zone from its destination, and a
-- later change of destination fills it in again. A time zone the person picked
-- in Trip settings is never changed, so this remembers which kind it is.
ALTER TABLE "travel_trips" ADD COLUMN IF NOT EXISTS "time_zone_guessed" boolean DEFAULT false NOT NULL;
