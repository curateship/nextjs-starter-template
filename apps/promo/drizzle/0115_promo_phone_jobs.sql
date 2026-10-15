-- The phone farm's second step: Promo's jobs on phones, a phone's screen in a
-- window, the rack's own settings and pause, and two-factor codes. Task
-- "Phone farm/02".
--
-- Additions only. Nothing stored is renamed or dropped.

-- The phone's own clock, read by the rack on every check-in, so an account on
-- a phone keeps the waking hours of where the phone is.
ALTER TABLE "promo_phones"
  ADD COLUMN IF NOT EXISTS "time_zone" varchar(64) NOT NULL DEFAULT '';

-- While a person controls the phone from its screen window, its jobs wait.
-- Each tap moves this fifteen minutes on; closing the window clears it, and a
-- forgotten window lets go by itself when it passes.
ALTER TABLE "promo_phones"
  ADD COLUMN IF NOT EXISTS "control_until" timestamptz;

-- A phone job's lane is "phone:" and the phone's id, 42 letters, longer than
-- a profile id's 36. Widening keeps every lane already stored.
ALTER TABLE "promo_jobs" ALTER COLUMN "lane" TYPE varchar(64);

-- How long the rack has for an action once it starts. A Settings read takes
-- seconds; a comment is a whole visit of up to fifteen minutes.
ALTER TABLE "promo_phone_actions"
  ADD COLUMN IF NOT EXISTS "timeout_seconds" integer NOT NULL DEFAULT 300;

-- The rack's settings, one row like the browser settings: how many phones
-- work at once, how many days pictures are kept, and whether the whole rack
-- is paused (and who paused it, for the bell).
CREATE TABLE IF NOT EXISTS "promo_phone_settings" (
  "id" varchar(20) PRIMARY KEY,
  "max_working" integer NOT NULL DEFAULT 5,
  "screenshot_days" integer NOT NULL DEFAULT 7,
  "paused_at" timestamptz,
  "paused_by" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "pause_notice_id" varchar(36),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "promo_phone_settings" ("id") VALUES ('default') ON CONFLICT DO NOTHING;

-- An account's authenticator secret, encrypted with the server's key like a
-- window password. Empty for none. It is never shown again once saved; only
-- the current six-digit code is.
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "totp_secret_encrypted" text NOT NULL DEFAULT '';
