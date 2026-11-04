-- Travel features part 2 (Tyler, 3 Nov 2026: "Add Night too"): a card with no
-- start time can be set to a part of the day, and the day sorts by it. Null
-- is no part. A start time clears it, so only untimed cards hold one.
ALTER TABLE "travel_activities" ADD COLUMN IF NOT EXISTS "day_part" varchar(12);
