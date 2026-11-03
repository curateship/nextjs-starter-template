-- Tyler, 2 Nov 2026: "Remove the booking feature" and "Remove the journal
-- feature". An activity keeps its cost; its Booked or To book mark, its
-- confirmation number, its booking link and its own files go. The trip's own
-- documents stay. Nothing here is live yet, so the columns and rows go too.

ALTER TABLE "travel_activities" DROP CONSTRAINT IF EXISTS "travel_activities_booking";
ALTER TABLE "travel_activities" DROP COLUMN IF EXISTS "booking";
ALTER TABLE "travel_activities" DROP COLUMN IF EXISTS "confirmation";
ALTER TABLE "travel_activities" DROP COLUMN IF EXISTS "booking_url";

DELETE FROM "travel_files" WHERE "activity_id" IS NOT NULL;
ALTER TABLE "travel_files" DROP COLUMN IF EXISTS "activity_id";

DROP TABLE IF EXISTS "travel_journal_entries";

-- An activity's notes are now the editor's own document (as Project's task
-- notes are), not HTML. The few notes written as HTML start again empty.
UPDATE "travel_activities" SET "notes" = '' WHERE "notes" LIKE '<%';
UPDATE "travel_saved_places" SET "notes" = '' WHERE "notes" LIKE '<%';
