-- Viral research moved to its own app, so Video's Viral section goes: the
-- Viral projects and their keywords, results, creators, hidden channels and
-- pasted links, Favourites, followed creators and their posts, the YouTube
-- unit tally and the YouTube search key (Tyler, 4 Nov 2026: "Delete them").
--
-- What stays: `video_viral_videos`, the saved viral videos that editor videos
-- copy, which the editor's Copy panel still plays and shows the breakdown of
-- (Tyler picked "Keep the Copy panel"), and the Send to Video connection
-- (`video_viral_links`, `video_viral_arrivals`).
--
-- CASCADE takes the foreign keys other tables hold on these.

DROP TABLE IF EXISTS "video_viral_collection_items" CASCADE;
DROP TABLE IF EXISTS "video_viral_collections" CASCADE;
DROP TABLE IF EXISTS "video_viral_project_links" CASCADE;
DROP TABLE IF EXISTS "video_viral_project_creators" CASCADE;
DROP TABLE IF EXISTS "video_viral_project_hidden_channels" CASCADE;
DROP TABLE IF EXISTS "video_viral_project_results" CASCADE;
DROP TABLE IF EXISTS "video_viral_project_keywords" CASCADE;
DROP TABLE IF EXISTS "video_viral_projects" CASCADE;
DROP TABLE IF EXISTS "video_viral_project_folders" CASCADE;
DROP TABLE IF EXISTS "video_creator_posts" CASCADE;
DROP TABLE IF EXISTS "video_creators" CASCADE;
DROP TABLE IF EXISTS "video_youtube_unit_spend" CASCADE;

-- Which Viral project a saved video or an editor video came from. The
-- projects are gone, so these name nothing.
ALTER TABLE "video_viral_videos" DROP COLUMN IF EXISTS "viral_project_id";
ALTER TABLE "video_project_videos" DROP COLUMN IF EXISTS "source_viral_project_id";
ALTER TABLE "video_projects" DROP COLUMN IF EXISTS "source_viral_project_id";

-- The key the Viral page searched YouTube with. Settings → YouTube keeps only
-- the channel retention curves are read from.
ALTER TABLE "video_settings" DROP COLUMN IF EXISTS "youtube_api_key";

-- Saved views of a Viral project's videos.
DELETE FROM "saved_views" WHERE "screen" LIKE 'viral-project:%';

-- A home page set to one of those removed pages goes back to the default, so
-- that admin lands on the Overview instead of a page that is gone. The home
-- pages are shell settings in "settings" (`adminRoute`, `memberHomeRoute`),
-- and an empty value means the default.
UPDATE "settings"
SET settings = jsonb_set(settings, '{adminRoute}', '""'::jsonb), updated_at = now()
WHERE settings->>'adminRoute' ~ '^/admin/(video-viral|video-favourites|video-creators)([/?#]|$)';
UPDATE "settings"
SET settings = jsonb_set(settings, '{memberHomeRoute}', '""'::jsonb), updated_at = now()
WHERE settings->>'memberHomeRoute' ~ '^/admin/(video-viral|video-favourites|video-creators)([/?#]|$)';

-- The left menu loses Viral, Favourites and the old Creators link, wherever
-- they sit. A top-level Viral link's other sub-links take its place in the
-- same order, so nothing somebody added under it is lost. A menu without any
-- of the three is left alone.
WITH gone(href) AS (
  VALUES ('/admin/video-viral'), ('/admin/video-favourites'), ('/admin/video-creators')
),
rebuilt AS (
  SELECT
    workspaces.id,
    jsonb_set(
      workspaces.settings,
      '{sections}',
      -- An empty menu stays an empty list, never null: jsonb_set with null
      -- answers null, and settings may not be null.
      COALESCE((
        SELECT jsonb_agg(
          CASE
            -- Only a list of entries is rebuilt. Anything else is left as it is.
            WHEN jsonb_typeof(section->'entries') = 'array' THEN
              jsonb_set(
                section,
                '{entries}',
                COALESCE((
                  SELECT jsonb_agg(item ORDER BY entry_order, part)
                  FROM jsonb_array_elements(section->'entries')
                    WITH ORDINALITY AS entries(entry, entry_order)
                  CROSS JOIN LATERAL (
                    -- A kept entry, with any removed sub-links taken out.
                    SELECT
                      0 AS part,
                      CASE
                        WHEN jsonb_typeof(entry->'children') = 'array' THEN
                          jsonb_set(
                            entry,
                            '{children}',
                            COALESCE((
                              SELECT jsonb_agg(child ORDER BY child_order)
                              FROM jsonb_array_elements(entry->'children')
                                WITH ORDINALITY AS children(child, child_order)
                              WHERE NOT EXISTS (SELECT 1 FROM gone WHERE gone.href = child->>'href')
                            ), '[]'::jsonb),
                            true
                          )
                        ELSE entry
                      END AS item
                    WHERE NOT EXISTS (SELECT 1 FROM gone WHERE gone.href = entry->>'href')
                    UNION ALL
                    -- A removed entry's own sub-links that are kept, in its place.
                    SELECT child_order AS part, child AS item
                    FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(entry->'children') = 'array' THEN entry->'children' ELSE '[]'::jsonb END
                    ) WITH ORDINALITY AS children(child, child_order)
                    WHERE EXISTS (SELECT 1 FROM gone WHERE gone.href = entry->>'href')
                      AND NOT EXISTS (SELECT 1 FROM gone WHERE gone.href = child->>'href')
                  ) AS entry_rows
                ), '[]'::jsonb),
                true
              )
            ELSE section
          END
          ORDER BY section_order
        )
        FROM jsonb_array_elements(workspaces.settings->'sections')
          WITH ORDINALITY AS sections(section, section_order)
      ), '[]'::jsonb),
      true
    ) AS settings
  FROM workspaces
  -- Only a menu that is there: with no sections list, the rebuilt list would
  -- be null and wipe the whole settings.
  WHERE jsonb_typeof(workspaces.settings->'sections') = 'array'
    AND (
      workspaces.settings::text LIKE '%"/admin/video-viral"%'
      OR workspaces.settings::text LIKE '%"/admin/video-favourites"%'
      OR workspaces.settings::text LIKE '%"/admin/video-creators"%'
    )
)
UPDATE workspaces
SET settings = rebuilt.settings,
    updated_at = now()
FROM rebuilt
WHERE workspaces.id = rebuilt.id;
