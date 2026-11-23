-- Audience dimensions: device / browser / country per raw event, plus daily
-- per-dimension visitor rollups and the Audience sidebar page.
-- Idempotent: setup-database.mjs re-runs every .sql file on each db:setup.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "device" varchar(16);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "browser" varchar(32);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "country" varchar(2);

ALTER TABLE "daily_site_stats" ADD COLUMN IF NOT EXISTS "devices" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "daily_site_stats" ADD COLUMN IF NOT EXISTS "browsers" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "daily_site_stats" ADD COLUMN IF NOT EXISTS "countries" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Add the Audience page to the Analytics sidebar section of any workspace
-- whose Analytics section does not already have it.
UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN section->>'id' = 'section-analytics'
        THEN jsonb_set(
          section,
          '{entries}',
          COALESCE(section->'entries', '[]'::jsonb)
            || '[{"type":"item","id":"item-audience","label":"Audience","href":"/audience","icon":"users","visible":true}]'::jsonb
        )
        ELSE section
      END
      ORDER BY idx
    )
    FROM jsonb_array_elements("settings"->'sections') WITH ORDINALITY AS s(section, idx)
  )
)
WHERE COALESCE("settings"->'sections', '[]'::jsonb) @> '[{"id":"section-analytics"}]'::jsonb
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("settings"->'sections') AS s(section)
    WHERE s.section->>'id' = 'section-analytics'
      AND s.section->'entries' @> '[{"id":"item-audience"}]'::jsonb
  );
