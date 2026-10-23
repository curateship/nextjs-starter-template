-- A third kind of home page row: the soonest upcoming events.
--
-- Rows saved before this keep their kind. A check constraint can only be
-- replaced whole, so the full list is restated with 'events' added.
ALTER TABLE "directory_front_page_sections"
  DROP CONSTRAINT IF EXISTS "directory_front_page_sections_kind_check";
ALTER TABLE "directory_front_page_sections"
  ADD CONSTRAINT "directory_front_page_sections_kind_check"
  CHECK ("kind" IN ('listings', 'categories', 'events'));
