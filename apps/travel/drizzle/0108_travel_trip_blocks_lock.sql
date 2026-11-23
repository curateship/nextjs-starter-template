-- Lock blocks (Tyler, 7 Nov 2026: "add lock blocks button"): the trip's
-- description in its left panel, words and blocks, reads only until it's
-- unlocked from the trip's ⋮, as a Project page can be locked.
ALTER TABLE "travel_trips" ADD COLUMN IF NOT EXISTS "description_locked" boolean NOT NULL DEFAULT false;
