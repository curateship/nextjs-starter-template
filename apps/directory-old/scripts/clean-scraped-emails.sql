-- One-off cleanup: drop email rows that an import scraped off a business's own
-- website but that are not contact addresses — a site builder's error-reporting
-- inbox (Wix relays through `<32-hex-key>@sentry-next.wixpress.com`, which shows
-- on the listing as a meaningless string of letters and numbers), an automated
-- sender, or a leftover template placeholder.
--
-- The importer now refuses these on the way in (src/lib/utils/contact-email.ts);
-- this clears the ones saved before that. Run it once per database.
--
--   docker exec -i directory-postgres-1 psql -U postgres -d postgres \
--     < apps/directory/scripts/clean-scraped-emails.sql
--
-- It only ever removes an email link from a Core block's menu; every other link
-- and every other block is written back untouched. Running it twice changes
-- nothing the second time. Run the SELECT at the bottom first to see exactly
-- which listings it would touch.
--
-- Note for the local database: the demo listings all carry
-- `hello@<slug>.example.com`, which counts as a placeholder, so this clears
-- their emails too. That is only demo data.

BEGIN;

UPDATE directory AS d
SET content_blocks = rebuilt.content_blocks,
    updated_at = now()
FROM (
  SELECT
    inner_directory.id,
    jsonb_object_agg(
      block.key,
      CASE
        WHEN block.value ->> 'type' = 'directory-core'
             AND jsonb_typeof(block.value #> '{content,menuLinks}') = 'array'
        THEN jsonb_set(
               block.value,
               '{content,menuLinks}',
               (
                 SELECT COALESCE(jsonb_agg(link ORDER BY position), '[]'::jsonb)
                 FROM jsonb_array_elements(block.value #> '{content,menuLinks}')
                        WITH ORDINALITY AS menu_link(link, position)
                 WHERE NOT (
                   link ->> 'type' = 'email'
                   AND (
                     -- Wix's error relay, Sentry, and template placeholders.
                     lower(split_part(link ->> 'value', '@', 2)) ~
                       '(^|\.)(wixpress\.com|sentry\.io|example\.(com|net|org)|localhost|invalid|test)$'
                     -- A long run of nothing but hex is a generated key.
                     OR split_part(lower(link ->> 'value'), '@', 1) ~ '^[0-9a-f]{24,}$'
                     -- Senders nobody reads.
                     OR split_part(lower(link ->> 'value'), '@', 1) IN
                          ('noreply', 'no-reply', 'donotreply', 'do-not-reply', 'no_reply')
                   )
                 )
               )
             )
        ELSE block.value
      END
    ) AS content_blocks
  FROM directory AS inner_directory,
       jsonb_each(inner_directory.content_blocks) AS block
  -- jsonb_each errors on anything that is not an object, so never hand it one.
  WHERE jsonb_typeof(inner_directory.content_blocks) = 'object'
  GROUP BY inner_directory.id
) AS rebuilt
WHERE d.id = rebuilt.id
  AND d.content_blocks IS DISTINCT FROM rebuilt.content_blocks;

COMMIT;

-- Check: lists every email still saved on a listing. Nothing here should look
-- like a key or a robot.
--
-- SELECT d.slug, link ->> 'value' AS email
-- FROM directory AS d,
--      jsonb_each(d.content_blocks) AS block,
--      jsonb_array_elements(block.value #> '{content,menuLinks}') AS link
-- WHERE block.value ->> 'type' = 'directory-core'
--   AND jsonb_typeof(block.value #> '{content,menuLinks}') = 'array'
--   AND link ->> 'type' = 'email'
-- ORDER BY d.slug;
