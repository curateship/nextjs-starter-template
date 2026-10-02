-- A logo used in a sent email must remain at its public address for as long as
-- that inbox copy exists. The first real send stamps the media row, and media
-- deletion leaves stamped files in place.

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "email_protected_at" timestamp with time zone;

-- Protect logos that can already be proven to have gone out before this column
-- existed. Public URLs include the storage path, so this does not need to know
-- which public media hostname a deployment uses.
UPDATE "media" AS media
SET "email_protected_at" = now()
WHERE "email_protected_at" IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM "broadcasts" AS broadcast
      WHERE broadcast."workspace_id" = media."workspace_id"
        AND broadcast."status" IN ('sending', 'sent')
        AND strpos(broadcast."rendered_html", media."storage_path") > 0
    )
    OR EXISTS (
      SELECT 1
      FROM "system_emails" AS email
      WHERE email."workspace_id" = media."workspace_id"
        AND strpos(email."blocks"::text, media."storage_path") > 0
        AND EXISTS (
          SELECT 1
          FROM "system_email_sends" AS sent
          WHERE sent."workspace_id" = email."workspace_id"
            AND sent."kind" = email."kind"
            AND sent."status" = 'sent'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM "automation_runs" AS run
      JOIN "automation_deliveries" AS delivery
        ON delivery."run_id" = run."id"
      WHERE run."workspace_id" = media."workspace_id"
        AND delivery."status" = 'sent'
        AND strpos(run."config_snapshot"::text, media."storage_path") > 0
    )
  );
