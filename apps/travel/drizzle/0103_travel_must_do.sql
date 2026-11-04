-- More Travel features part 4 (Tyler, 4 Nov 2026: "Filter: Must do only", "AI
-- plans around it", "Warn if left in Ideas"): a card can be marked Must do.
-- AI never moves or replaces one, Filter can show only them, and one still in
-- Ideas once the trip has started is marked in red.
ALTER TABLE "travel_activities" ADD COLUMN IF NOT EXISTS "must_do" boolean DEFAULT false NOT NULL;
