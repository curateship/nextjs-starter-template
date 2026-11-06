-- Travel features 4, parts 6 and 7 (Tyler, 6 Nov 2026: "Same Bin as cards"
-- and "Right-click, many pins"): a deleted trip note waits 30 days in the
-- trip's bin with its cards instead of going at once, and a note can be pinned
-- to the top of the notes list.
ALTER TABLE "travel_trip_notes" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "travel_trip_notes" ADD COLUMN IF NOT EXISTS "pinned_at" timestamptz;
