-- A fifth kind of home page row: the newest published posts, with a count and
-- an optional category like the events and deals rows.
--
-- Rows saved before this keep their kind. A check constraint can only be
-- replaced whole, so the full list is restated with 'posts' added.
ALTER TABLE "directory_front_page_sections"
  DROP CONSTRAINT IF EXISTS "directory_front_page_sections_kind_check";
ALTER TABLE "directory_front_page_sections"
  ADD CONSTRAINT "directory_front_page_sections_kind_check"
  CHECK ("kind" IN ('listings', 'categories', 'events', 'deals', 'posts'));
