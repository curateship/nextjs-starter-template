-- Travel features part 8 (Tyler, 3 Nov 2026: "A Bin tab"): deleting a trip
-- puts it in the Trips table's bin for 30 days, with everything on it,
-- instead of deleting it at once. Null is a trip that isn't in the bin.
ALTER TABLE "travel_trips" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
