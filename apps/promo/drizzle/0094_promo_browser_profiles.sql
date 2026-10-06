-- Browser profiles as their own record.
--
-- Until now a Reddit account owned its proxy, its identity and its browser:
-- `promo_accounts.proxy_id`, `promo_accounts.fingerprint`, and a session row
-- locked to the account. Tyler, 5 Oct 2026: "proxy and browser isolation is an
-- app wide feature, not just a reddit feature." So a profile now holds the
-- proxy, the identity and the cookie volume, the browser belongs to the
-- profile, and an account simply points at one.
--
-- Numbered 0094 because the shell's 0091 arrived in promo as 0093. The runner
-- in scripts/migrations.mjs records each file by its whole name, so a later
-- shell file that also starts 0094 does not collide with this one; the two
-- 0058 files already live side by side.
--
-- Nothing stored is renamed or dropped. `promo_accounts.proxy_id`,
-- `promo_accounts.fingerprint` and `promo_browser_sessions.account_id` stay
-- where they are and the code stops reading them.

CREATE TABLE IF NOT EXISTS "promo_profiles" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- What to call it on screen. The person's own words.
  "name" varchar(120) NOT NULL,
  -- Null means the browser goes out from this machine's own address. Losing
  -- the proxy leaves the profile and its cookies alone.
  "proxy_id" varchar(36) REFERENCES "promo_proxies"("id") ON DELETE SET NULL,
  -- The generated identity the browser launches with, whole in one column.
  "fingerprint" jsonb,
  -- The Docker volume holding the cookies. Stored, never worked out, because
  -- the first profiles keep the volume their account already had.
  "volume_name" varchar(120) NOT NULL,
  "notes" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_profiles_user" ON "promo_profiles" ("user_id");

-- Two profiles on one volume would be one set of cookies opened twice.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_profiles_volume"
  ON "promo_profiles" ("volume_name");

-- An account points at its profile. Deleting a profile leaves the account
-- with none, and its jobs are refused with a reason, rather than deleting it.
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "profile_id" varchar(36)
    REFERENCES "promo_profiles"("id") ON DELETE SET NULL;

-- One account per network inside a profile. Two Reddit accounts in one browser
-- would be signed in over each other.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_accounts_profile_platform"
  ON "promo_accounts" ("profile_id", "platform")
  WHERE "profile_id" IS NOT NULL;

-- What the browser program last saw on this account's network, written after
-- every job so a dashboard reads a row instead of asking a browser. The
-- signed-in name already has a column, `handle`, which nothing wrote before.
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "blocked" boolean NOT NULL DEFAULT false;
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "blocked_reason" text NOT NULL DEFAULT '';
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "state_read_at" timestamptz;

-- The open browser belongs to a profile.
ALTER TABLE "promo_browser_sessions"
  ADD COLUMN IF NOT EXISTS "profile_id" varchar(36)
    REFERENCES "promo_profiles"("id") ON DELETE CASCADE;

-- The window's password, encrypted with the shell's `encryptSecret`. A
-- dashboard has to show it and is not the program that opened the browser.
-- The command token is never stored.
ALTER TABLE "promo_browser_sessions"
  ADD COLUMN IF NOT EXISTS "stream_password_encrypted" text NOT NULL DEFAULT '';

-- Adopt what exists: one profile per account, carrying the account's proxy and
-- identity, on the exact volume the account's cookies are already in. The
-- volume is never renamed, so the sign-in inside it is never lost.
INSERT INTO "promo_profiles"
  ("id", "user_id", "name", "proxy_id", "fingerprint", "volume_name")
SELECT
  gen_random_uuid()::text,
  "a"."user_id",
  'Main',
  "a"."proxy_id",
  "a"."fingerprint",
  'promo-profile-' || "a"."id"
FROM "promo_accounts" AS "a"
WHERE "a"."profile_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "promo_profiles" AS "p"
    WHERE "p"."volume_name" = 'promo-profile-' || "a"."id"
  );

UPDATE "promo_accounts" AS "a"
SET "profile_id" = "p"."id"
FROM "promo_profiles" AS "p"
WHERE "a"."profile_id" IS NULL
  AND "p"."volume_name" = 'promo-profile-' || "a"."id";

-- Every past and present browser was on its account's volume, which is now
-- that account's profile.
UPDATE "promo_browser_sessions" AS "s"
SET "profile_id" = "a"."profile_id"
FROM "promo_accounts" AS "a"
WHERE "s"."profile_id" IS NULL
  AND "s"."account_id" = "a"."id";

ALTER TABLE "promo_browser_sessions" ALTER COLUMN "profile_id" SET NOT NULL;

-- A browser no longer belongs to an account, so a new session row has none.
ALTER TABLE "promo_browser_sessions" ALTER COLUMN "account_id" DROP NOT NULL;

-- The one-live-browser rule moves from the account to the profile. Still an
-- index rather than code, because two containers on one volume corrupt it.
DROP INDEX IF EXISTS "ux_promo_sessions_live_account";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_sessions_live_profile"
  ON "promo_browser_sessions" ("profile_id")
  WHERE "status" IN ('starting', 'running');
