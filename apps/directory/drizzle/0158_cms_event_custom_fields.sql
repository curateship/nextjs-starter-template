-- Extra fields on events (task events/07, 19 Nov 2026).
--
-- directory_custom_sections.kind: whose fields a section holds, 'listing' or
-- 'event'. Every section made before this one is a listing's. Tyler chose
-- "Own row on Events": events keep a list of their own, so "Cuisine" never
-- shows on an event. Slugs stay unique across both kinds on a site, which only
-- means an event section named like a listing one is filed as "details-2".
--
-- events.custom_values: what each event filled in, keyed by section slug and
-- then field key, the same shape as directory_listings.custom_values. Blank
-- answers are never stored.
ALTER TABLE "directory_custom_sections" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'listing';
ALTER TABLE "directory_custom_sections" DROP CONSTRAINT IF EXISTS "directory_custom_sections_kind_check";
ALTER TABLE "directory_custom_sections" ADD CONSTRAINT "directory_custom_sections_kind_check" CHECK ("kind" IN ('listing', 'event'));

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "custom_values" jsonb NOT NULL DEFAULT '{}'::jsonb;
