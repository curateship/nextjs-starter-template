-- The last two things a customer notices from the outside.
--
-- **The settings row was sorted into three piles before any of this was
-- written**, because most of what it holds turns out to be genuinely the
-- deployment's and should stay exactly where it is:
--
--   * **The deployment's.** How long sign-ins last, the kill switch that stops
--     every flow, maintenance mode that takes the whole app down, how long a
--     toast shows, how many rows a table draws, where /admin opens, the member
--     sidebar, which notice kinds the tray shows. One auth system, one tray,
--     one admin app — these are not a site's business.
--   * **A site's.** Its mark on its own signed-out pages, and the wording of
--     the emails it sends. Those are the two a customer sees, and they are what
--     this migration moves.
--   * **Already a site's, and merely looked global.** Its name, favicon,
--     sidebar, styling, dashboard and which of its pages are hidden all moved
--     in earlier tasks. The app-wide copies are fallbacks for somebody in no
--     site at all.
--
-- The app name stays where it is on purpose: `readBranding` already prefers the
-- site's own name for a visitor on that site's domain, so the stored value is
-- the deployment's fallback rather than something a site has to override.

-- A site's own mark -----------------------------------------------------------
--
-- The logo is drawn on the signed-out pages — sign in, register, verify, reset
-- password. A visitor on Alpha's domain seeing Beta's mark there is the plainest
-- possible way to look like the wrong business. The site's favicon already lived
-- on the site; the logo is what was left behind.
--
-- Every existing site inherits the deployment's logo, so nothing changes look
-- until somebody deliberately gives a site its own.

UPDATE "workspaces" w
SET "settings" = jsonb_set(
  jsonb_set(
    COALESCE(w."settings", '{}'::jsonb),
    '{logo}',
    COALESCE((SELECT s."settings"->'logo' FROM "settings" s WHERE s."key" = 'default'), '""'::jsonb)
  ),
  '{logoDark}',
  COALESCE((SELECT s."settings"->'logoDark' FROM "settings" s WHERE s."key" = 'default'), '""'::jsonb)
)
WHERE NOT (COALESCE(w."settings", '{}'::jsonb) ? 'logo');

-- A site's own words ----------------------------------------------------------
--
-- `system_emails` was keyed by kind alone, and the comment above it said why:
-- "A workspace belongs to one person." That sentence is the assumption this
-- whole set of changes overturns, so the table follows.
--
-- The old objection was that somebody clicking "verify my email" has no
-- workspace. True, and beside the point: the email is not sent on *their*
-- behalf, it is sent on the site's — the site they registered on, which is the
-- domain they were looking at. That is a question with an answer.

ALTER TABLE "system_emails" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "system_emails"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

-- Wording saved on a deployment with no site at all belongs to nothing. There
-- is no such deployment in practice — an admin has to sign in to write it — but
-- dropping the row beats blocking the upgrade.
DELETE FROM "system_emails" WHERE "workspace_id" IS NULL;

ALTER TABLE "system_emails" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "system_emails" DROP CONSTRAINT IF EXISTS "system_emails_pkey";
ALTER TABLE "system_emails"
  ADD CONSTRAINT "system_emails_pkey" PRIMARY KEY ("workspace_id", "kind");

ALTER TABLE "system_emails" DROP CONSTRAINT IF EXISTS "system_emails_workspace_id_workspaces_id_fk";
ALTER TABLE "system_emails"
  ADD CONSTRAINT "system_emails_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- The paper trail follows the wording: which site's email went out is exactly
-- as worth knowing as what it said.
--
-- **Optional, unlike the wording above.** The wording is written by an admin,
-- so a site exists by definition. A send does not wait for that: the very first
-- person to register on a fresh install gets a verification email before any
-- admin has ever signed in, and therefore before there is a site. Requiring it
-- here would throw away the record of exactly the emails somebody is most
-- likely to ask "it never arrived" about.

ALTER TABLE "system_email_sends" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "system_email_sends"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

ALTER TABLE "system_email_sends" DROP CONSTRAINT IF EXISTS "system_email_sends_workspace_id_workspaces_id_fk";
ALTER TABLE "system_email_sends"
  ADD CONSTRAINT "system_email_sends_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- Stripe stays one set of keys for the deployment, and that is now a decision
-- rather than an assumption nobody revisited. See the comment on
-- `stripe_settings` in `src/server/schema.ts` for the reasoning; nothing about
-- the table changes here.
