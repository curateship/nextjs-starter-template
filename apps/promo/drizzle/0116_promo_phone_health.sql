-- The phone farm's third step: phone health in the bell, ban screens that
-- stop an account, frozen apps and phones restarted, a picture of every step,
-- each phone's history and battery chart, the daily self-test, and app
-- updates one phone at a time. Task "Phone farm/03".
--
-- Additions only. Nothing stored is renamed or dropped.

-- What the rack last read off each phone, about once a minute: battery,
-- heat, storage, the SIM's signal, how long since it started, and each
-- app's version. `state_since` is when adb's word for it last changed, so a
-- phone offline for five minutes can be told from one that blinked.
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "state_since" timestamptz;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "battery_percent" integer;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "temperature_c" real;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "storage_used_percent" integer;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "signal" varchar(20) NOT NULL DEFAULT '';
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "signal_lost_at" timestamptz;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "up_seconds" integer;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "vitals_at" timestamptz;
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "apps" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Everything that happened to a phone, for the History tab in its window:
-- plugged in, unplugged, restarted, an app updated, an account moved on or
-- signed in, ran hot, and each notice raised and cleared.
CREATE TABLE IF NOT EXISTS "promo_phone_events" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) NOT NULL REFERENCES "promo_phones"("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "detail" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_phone_events_phone" ON "promo_phone_events" ("phone_id", "created_at" DESC);

-- Battery and heat every ten minutes, and every reading at 45 degrees or
-- more, for the four-week chart. Older rows are deleted.
CREATE TABLE IF NOT EXISTS "promo_phone_readings" (
  "phone_id" varchar(36) NOT NULL REFERENCES "promo_phones"("id") ON DELETE CASCADE,
  "at" timestamptz NOT NULL,
  "battery_percent" integer,
  "temperature_c" real,
  PRIMARY KEY ("phone_id", "at")
);

-- A picture per step, kept encrypted in R2 like a profile's backup rather
-- than in the database. `image_base64` stays for the pictures taken before;
-- new ones leave it empty.
ALTER TABLE "promo_phone_screenshots" ALTER COLUMN "image_base64" SET DEFAULT '';
ALTER TABLE "promo_phone_screenshots" ADD COLUMN IF NOT EXISTS "step" varchar(200) NOT NULL DEFAULT '';
ALTER TABLE "promo_phone_screenshots" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;
ALTER TABLE "promo_phone_screenshots" ADD COLUMN IF NOT EXISTS "object_key" varchar(300) NOT NULL DEFAULT '';

-- How long the rack has for an action is sent with it, so the rack can
-- reopen a frozen app before Promo gives up. What the rack did about a
-- freeze: 'app' when it closed and reopened the app, 'phone' when it
-- restarted the phone.
ALTER TABLE "promo_phone_actions" ADD COLUMN IF NOT EXISTS "recovered" varchar(10) NOT NULL DEFAULT '';

-- The daily self-test's answer for each action: passed, or broken at a step.
-- A broken action is refused until it passes again.
CREATE TABLE IF NOT EXISTS "promo_phone_action_checks" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action" varchar(60) NOT NULL,
  "passed" boolean NOT NULL,
  "step" varchar(200) NOT NULL DEFAULT '',
  "error" text NOT NULL DEFAULT '',
  "phone_action_id" varchar(36) REFERENCES "promo_phone_actions"("id") ON DELETE SET NULL,
  "checked_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "action")
);

-- The spare phone the self-test runs on (Tyler, 14 Oct 2026: a spare phone
-- signed into a test account, never a real account's phone), and when the
-- self-test and the Play Store look last ran.
ALTER TABLE "promo_phone_settings"
  ADD COLUMN IF NOT EXISTS "test_phone_id" varchar(36) REFERENCES "promo_phones"("id") ON DELETE SET NULL;
ALTER TABLE "promo_phone_settings" ADD COLUMN IF NOT EXISTS "self_test_at" timestamptz;

-- An app update going round the rack: seen in the Play Store, put on the
-- test phone, passed or failed the self-test there, and only then allowed
-- onto the other phones.
CREATE TABLE IF NOT EXISTS "promo_app_rollouts" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "app" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL,
  "from_version" varchar(60) NOT NULL DEFAULT '',
  "to_version" varchar(60) NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "app")
);

-- When a ban screen stopped the account. Its jobs are refused until a
-- person lets it run again; `blocked_reason` holds the screen's own words.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "ban_screen_at" timestamptz;
