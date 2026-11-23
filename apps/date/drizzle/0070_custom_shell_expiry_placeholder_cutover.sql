-- Older customized system emails used unit-specific expiry placeholders.
-- Move every saved surface to the one protected plain-English value, then the
-- runtime only needs one honest representation of a link's lifetime.
UPDATE "system_emails"
SET
  "subject" = replace(replace(replace(replace(
    "subject",
    '{{minutes}} minutes', '{{expires_in}}'
  ), '{{hours}} hours', '{{expires_in}}'), '{{minutes}}', '{{expires_in}}'), '{{hours}}', '{{expires_in}}'),
  "preheader" = replace(replace(replace(replace(
    "preheader",
    '{{minutes}} minutes', '{{expires_in}}'
  ), '{{hours}} hours', '{{expires_in}}'), '{{minutes}}', '{{expires_in}}'), '{{hours}}', '{{expires_in}}'),
  "blocks" = replace(replace(replace(replace(
    "blocks"::text,
    '{{minutes}} minutes', '{{expires_in}}'
  ), '{{hours}} hours', '{{expires_in}}'), '{{minutes}}', '{{expires_in}}'), '{{hours}}', '{{expires_in}}')::jsonb,
  "rendered_html" = CASE
    WHEN "rendered_html" IS NULL THEN NULL
    ELSE replace(replace(replace(replace(
      "rendered_html",
      '{{minutes}} minutes', '{{expires_in}}'
    ), '{{hours}} hours', '{{expires_in}}'), '{{minutes}}', '{{expires_in}}'), '{{hours}}', '{{expires_in}}')
  END
WHERE
  "subject" LIKE '%{{minutes}}%'
  OR "subject" LIKE '%{{hours}}%'
  OR "preheader" LIKE '%{{minutes}}%'
  OR "preheader" LIKE '%{{hours}}%'
  OR "blocks"::text LIKE '%{{minutes}}%'
  OR "blocks"::text LIKE '%{{hours}}%'
  OR "rendered_html" LIKE '%{{minutes}}%'
  OR "rendered_html" LIKE '%{{hours}}%';
