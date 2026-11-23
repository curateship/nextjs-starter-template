-- A page an admin wrote becomes a page built from blocks.
--
-- It held one body of words and nothing else, so there was no way to put a hero
-- or a logo strip on it: writing a page and building a page were two different
-- things, and only one of them could be done from the app. Tyler's call on
-- 4 Oct 2026: "I think all pages thats added by me should be block enabled."
--
-- The words are not thrown away and they are not squeezed into a text block,
-- which holds a heading and 500 characters. They become one `words` block,
-- carrying the same document, drawn by the same renderer and checked by the
-- same `cleanWrittenPageBody` as before.
--
-- The page's title becomes that block's heading, because the title was drawn
-- above the words by the page itself and the block is what draws it from here
-- on. The row keeps its title as well: that is the page's name, in the Pages
-- list and in the browser tab.

INSERT INTO "page_blocks" (
  "id", "workspace_id", "path", "position", "kind", "app_kind", "settings",
  "created_at", "updated_at"
)
SELECT
  'words-' || w."id",
  w."workspace_id",
  w."path",
  0,
  'words',
  NULL,
  jsonb_build_object(
    'heading', w."title",
    'intro', '',
    -- The width it already had. A written page was a card capped at 672px, and
    -- the narrow layout is 768px, which is the closest this app has. Full width
    -- would re-wrap every page that exists.
    'layout', 'narrow',
    'alignment', 'inherit',
    'hidden', false,
    'device', 'all',
    'body', w."body"
  ),
  w."created_at",
  w."updated_at"
FROM "written_pages" w
-- A page whose words are already a block is left alone, so the file can be run
-- again without a second copy of anything.
WHERE NOT EXISTS (
  SELECT 1 FROM "page_blocks" b
  WHERE b."workspace_id" = w."workspace_id" AND b."path" = w."path"
);

-- And the column goes, in the same file that moved it, so there is one place a
-- page's words live rather than two that can disagree.
ALTER TABLE "written_pages" DROP COLUMN IF EXISTS "body";
