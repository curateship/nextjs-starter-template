-- Two more kinds of home page row, both copied from the platform's own front
-- page: a hero, and the public plans.
--
-- A hero keeps its own wording, link, picture and stars, so it gets seven
-- columns of its own. Every other kind of row leaves them at their defaults. A
-- plans row stores nothing extra: the plans belong to the deployment, and the
-- page reads them when it draws.
--
-- Rows saved before this keep their kind. A check constraint can only be
-- replaced whole, so the full list is restated with 'hero' and 'plans' added.
ALTER TABLE "directory_front_page_sections"
  ADD COLUMN IF NOT EXISTS "hero_action" varchar(20) NOT NULL DEFAULT 'button',
  ADD COLUMN IF NOT EXISTS "hero_image" varchar(2048) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "hero_alt" varchar(160) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "hero_button_label" varchar(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "hero_button_href" varchar(2048) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "hero_note" varchar(160) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "hero_stars" integer NOT NULL DEFAULT 0;

ALTER TABLE "directory_front_page_sections"
  DROP CONSTRAINT IF EXISTS "directory_front_page_sections_kind_check";
ALTER TABLE "directory_front_page_sections"
  ADD CONSTRAINT "directory_front_page_sections_kind_check"
  CHECK ("kind" IN ('listings', 'categories', 'events', 'deals', 'posts', 'hero', 'plans'));

ALTER TABLE "directory_front_page_sections"
  DROP CONSTRAINT IF EXISTS "directory_front_page_sections_hero_action_check";
ALTER TABLE "directory_front_page_sections"
  ADD CONSTRAINT "directory_front_page_sections_hero_action_check"
  CHECK ("hero_action" IN ('button', 'email'));

ALTER TABLE "directory_front_page_sections"
  DROP CONSTRAINT IF EXISTS "directory_front_page_sections_hero_stars_check";
ALTER TABLE "directory_front_page_sections"
  ADD CONSTRAINT "directory_front_page_sections_hero_stars_check"
  CHECK ("hero_stars" BETWEEN 0 AND 5);
