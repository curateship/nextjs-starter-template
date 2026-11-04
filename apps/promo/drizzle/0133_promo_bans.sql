-- Bans (workspace/tasks/Bans/01-ban-features.md): what a ban leaves behind on
-- the phone, SIM, proxy and browser profile it happened on, every phone's
-- accounts over time, screens Promo did not know, each account's own history,
-- the app-wide brake, and the account columns for why it was retired, where
-- it came from, and a slow restart.
--
-- Additions only. Nothing stored is renamed or dropped.

-- One row per ban, written once when an account is first stopped (part 1).
-- Where it ran is copied at that moment, so a later move, a new proxy or a
-- new SIM never changes what the ban was on (part 13).
CREATE TABLE IF NOT EXISTS "promo_bans" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) REFERENCES "promo_accounts"("id") ON DELETE SET NULL,
  -- The network, as promo_accounts.platform says it.
  "app" varchar(20) NOT NULL,
  -- The handle when it happened, kept for an account that is later deleted.
  "handle" varchar(120) NOT NULL DEFAULT '',
  -- suspended, locked, confirm, restricted or suspended_reading.
  "kind" varchar(20) NOT NULL,
  "words" text NOT NULL DEFAULT '',
  "phone_id" varchar(36) REFERENCES "promo_phones"("id") ON DELETE SET NULL,
  "profile_id" varchar(36) REFERENCES "promo_profiles"("id") ON DELETE SET NULL,
  "proxy_id" varchar(36) REFERENCES "promo_proxies"("id") ON DELETE SET NULL,
  "sim_number" varchar(40) NOT NULL DEFAULT '',
  "sim_carrier" varchar(120) NOT NULL DEFAULT '',
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  -- When the account was born on its network, and its posts in the 7 days
  -- before, for the Bans dashboard (part 12).
  "account_born_at" timestamptz,
  "posts_week" integer NOT NULL DEFAULT 0,
  -- The phone action that found it, and its picture kept apart from the
  -- step pictures the tidy-up deletes (part 10). '' when there is none.
  "action_id" varchar(36),
  "picture_key" text NOT NULL DEFAULT '',
  "at" timestamptz NOT NULL DEFAULT now(),
  -- When a person let the account run again. The ban still counts (part 3).
  "let_run_at" timestamptz,
  -- When Clean up retired the account and queued its phone's wipe (part 6).
  "cleaned_up_at" timestamptz,
  -- The appeal sent by hand in the app (part 25).
  "appealed_at" timestamptz,
  "appeal_note" text NOT NULL DEFAULT '',
  -- '' until an answer, then 'won' or 'lost'.
  "appeal_answer" varchar(10) NOT NULL DEFAULT '',
  "appeal_answered_at" timestamptz,
  "appeal_reminded_at" timestamptz,
  -- The weekly look at the banned app (part 26), and when it last found no
  -- ban screen.
  "looked_at" timestamptz,
  "looks_back_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ix_promo_bans_user" ON "promo_bans" ("user_id", "at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_bans_account" ON "promo_bans" ("account_id", "at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_bans_phone" ON "promo_bans" ("phone_id", "app");
CREATE INDEX IF NOT EXISTS "ix_promo_bans_proxy" ON "promo_bans" ("proxy_id", "app");

-- Every account a phone has held, from when it arrived to when it left and
-- how (part 2): moved, banned or retired.
CREATE TABLE IF NOT EXISTS "promo_phone_tenancies" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) NOT NULL REFERENCES "promo_phones"("id") ON DELETE CASCADE,
  "account_id" varchar(36) REFERENCES "promo_accounts"("id") ON DELETE SET NULL,
  "platform" varchar(20) NOT NULL,
  "handle" varchar(120) NOT NULL DEFAULT '',
  "arrived_at" timestamptz NOT NULL DEFAULT now(),
  "left_at" timestamptz,
  "left_how" varchar(10) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "ix_promo_phone_tenancies_phone" ON "promo_phone_tenancies" ("phone_id", "arrived_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_phone_tenancies_account" ON "promo_phone_tenancies" ("account_id") WHERE "left_at" IS NULL;

-- Each phone's starting row, from the account on it now. Older moves are
-- only the free-text lines in its History.
INSERT INTO "promo_phone_tenancies" ("id", "user_id", "phone_id", "account_id", "platform", "handle", "arrived_at")
SELECT "a"."id", "a"."user_id", "a"."phone_id", "a"."id", "a"."platform", "a"."handle", "a"."created_at"
FROM "promo_accounts" AS "a"
WHERE "a"."phone_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "promo_phone_tenancies" AS "t" WHERE "t"."account_id" = "a"."id");

-- A screen Promo did not know (part 9): asked about once, then learned as a
-- ban line the rack adds to its own list, or as a harmless line it skips.
CREATE TABLE IF NOT EXISTS "promo_ban_phrases" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "app" varchar(20) NOT NULL,
  -- The line that held one of the ban words, as the screen said it.
  "line" text NOT NULL,
  -- '' while asked, then 'ban' or 'harmless'.
  "verdict" varchar(10) NOT NULL DEFAULT '',
  "account_id" varchar(36) REFERENCES "promo_accounts"("id") ON DELETE SET NULL,
  "phone_id" varchar(36) REFERENCES "promo_phones"("id") ON DELETE SET NULL,
  "action_id" varchar(36),
  "words" text NOT NULL DEFAULT '',
  "picture_key" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "answered_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_ban_phrases_line" ON "promo_ban_phrases" ("user_id", "app", "line");

-- Each account's own history (part 14).
CREATE TABLE IF NOT EXISTS "promo_account_events" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "detail" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_account_events_account" ON "promo_account_events" ("account_id", "created_at" DESC);

-- The app-wide brake (part 11): two counted bans of one app inside 24 hours
-- pause every account on that app until a person releases it. Its own row,
-- never an account's pause, so releasing it never resumes an account a
-- person paused by hand.
CREATE TABLE IF NOT EXISTS "promo_app_brakes" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "app" varchar(20) NOT NULL,
  "braked_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "app")
);

-- Why an account was retired (part 15): banned, sold, given_up or other,
-- with a short note for other. '' on accounts retired before.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "retired_reason" varchar(10) NOT NULL DEFAULT '';
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "retired_note" varchar(200) NOT NULL DEFAULT '';
-- Where it came from (part 16): '' not said, 'made' or 'bought', the seller,
-- and the price in cents.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "source" varchar(10) NOT NULL DEFAULT '';
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "seller" varchar(120) NOT NULL DEFAULT '';
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "price_cents" integer;
-- Half pace until this moment after "Let it run again" (part 23).
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "slow_until" timestamptz;

-- Instagram's and TikTok's warm-up days in Settings -> Behaviour (part 19).
ALTER TABLE "promo_behaviour_settings" ADD COLUMN IF NOT EXISTS "app_warm_up_days" integer NOT NULL DEFAULT 7;

-- The Bans dashboard in the left menu, under Anti Detect right after Phones.
-- Every admin sidebar is a saved list on its workspace, so the link goes
-- into the saved sections that link to /admin/phones, right after it. A
-- sidebar that already links to /admin/bans is left alone.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') = 'array'
          AND jsonb_path_exists("s"."section", '$.entries[*] ? (@.href == "/admin/phones")')
        THEN jsonb_set(
          "s"."section",
          '{entries}',
          (
            SELECT jsonb_agg("item" ORDER BY "pos")
            FROM (
              SELECT "e"."entry" AS "item", "e"."ord"::numeric AS "pos"
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
              UNION ALL
              SELECT jsonb_build_object(
                'id', 'item-promo-bans',
                'href', '/admin/bans',
                'icon', 'ban',
                'type', 'item',
                'label', 'Bans',
                'visible', true
              ), "p"."ord" + 0.5
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "p"("entry", "ord")
              WHERE "p"."entry"->>'href' = '/admin/phones'
            ) AS "merged"
          )
        )
        ELSE "s"."section"
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord")
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/phones")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/bans")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/bans")');
