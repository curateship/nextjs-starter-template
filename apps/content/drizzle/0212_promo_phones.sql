-- The phone farm's first step: phones as records of their own, the rack
-- program at home that drives them, and an account that runs on a phone
-- instead of a browser profile. Task "Phone farm/01".
--
-- Additions only. Nothing stored is renamed or dropped.

-- One rack program, paired once with a one-time code. Its key signs every
-- message both ways and is kept encrypted with the server's own key. A
-- disconnected rack keeps its row, so its history stays readable, and its key
-- is refused from that moment.
CREATE TABLE IF NOT EXISTS "promo_racks" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL DEFAULT '',
  "key_encrypted" text NOT NULL,
  "platform" varchar(40) NOT NULL DEFAULT '',
  "version" varchar(40) NOT NULL DEFAULT '',
  -- What the last update did, in words, such as going back to the old version
  -- because the new one never checked in. Empty when there is nothing to say.
  "update_note" text NOT NULL DEFAULT '',
  "paired_at" timestamptz NOT NULL DEFAULT now(),
  "seen_at" timestamptz,
  "disconnected_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ix_promo_racks_user" ON "promo_racks" ("user_id");

-- The one-time codes Promo shows for pairing. Only a hash is stored, and a
-- code works once, for fifteen minutes.
CREATE TABLE IF NOT EXISTS "promo_rack_codes" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_rack_codes_hash" ON "promo_rack_codes" ("code_hash");

-- Every signed message carries a random word used once. A copied message sent
-- again finds its word already here and is refused. Rows older than the
-- clock window are cleared as new ones arrive.
CREATE TABLE IF NOT EXISTS "promo_rack_nonces" (
  "rack_id" varchar(36) NOT NULL REFERENCES "promo_racks"("id") ON DELETE CASCADE,
  "nonce" varchar(64) NOT NULL,
  "seen_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("rack_id", "nonce")
);

CREATE INDEX IF NOT EXISTS "ix_promo_rack_nonces_seen" ON "promo_rack_nonces" ("seen_at");

-- One Android phone. Whether it is connected is worked out from last_seen_at
-- and adb_state, which the rack program writes on every check-in, so the two
-- can never disagree. "held" is a person taking it out of use by hand.
CREATE TABLE IF NOT EXISTS "promo_phones" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "model" varchar(120) NOT NULL DEFAULT '',
  "android_version" varchar(40) NOT NULL DEFAULT '',
  "serial" varchar(120) NOT NULL DEFAULT '',
  "sim_carrier" varchar(120) NOT NULL DEFAULT '',
  "sim_number" varchar(40) NOT NULL DEFAULT '',
  -- 'sim' goes out over its own mobile data; 'wifi' goes out over the house
  -- Wi-Fi, through proxy_id when one is set.
  "connection" varchar(10) NOT NULL DEFAULT 'sim',
  "proxy_id" varchar(36) REFERENCES "promo_proxies"("id") ON DELETE SET NULL,
  "held" boolean NOT NULL DEFAULT false,
  "notes" text NOT NULL DEFAULT '',
  "folder_id" varchar(36) REFERENCES "promo_profile_folders"("id") ON DELETE SET NULL,
  "label_id" varchar(36) REFERENCES "promo_profile_labels"("id") ON DELETE SET NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The shelf slot a person types once, and the USB port the rack reports.
  "shelf_slot" varchar(20) NOT NULL DEFAULT '',
  "usb_port" varchar(120) NOT NULL DEFAULT '',
  "rack_id" varchar(36) REFERENCES "promo_racks"("id") ON DELETE SET NULL,
  -- adb's own word for the phone at the last check-in: 'device' is ready,
  -- 'unauthorized' is waiting for a tap on its screen, 'gone' is missing
  -- from a rack that was still checking in. Empty before the first.
  "adb_state" varchar(20) NOT NULL DEFAULT '',
  "last_seen_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ck_promo_phones_connection" CHECK ("connection" IN ('sim', 'wifi'))
);

CREATE INDEX IF NOT EXISTS "ix_promo_phones_user" ON "promo_phones" ("user_id");
-- A phone is found by its serial on every check-in. Two records for one
-- phone would split its accounts between them.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_phones_user_serial"
  ON "promo_phones" ("user_id", "serial") WHERE "serial" <> '';

-- One named action for one phone, asked for by Promo and run by the rack
-- program. Only names on the list both sides keep are ever written or run.
CREATE TABLE IF NOT EXISTS "promo_phone_actions" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rack_id" varchar(36) NOT NULL REFERENCES "promo_racks"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) NOT NULL REFERENCES "promo_phones"("id") ON DELETE CASCADE,
  "action" varchar(60) NOT NULL,
  "args" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'queued', 'running', 'done', 'failed' or 'cancelled'.
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "result" jsonb,
  "error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "finished_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ix_promo_phone_actions_rack"
  ON "promo_phone_actions" ("rack_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_promo_phone_actions_phone"
  ON "promo_phone_actions" ("phone_id", "created_at" DESC);

-- The pictures an action sent back, as JPEG in base64. Small on purpose: the
-- rack program shrinks each one before sending.
CREATE TABLE IF NOT EXISTS "promo_phone_screenshots" (
  "id" varchar(36) PRIMARY KEY,
  "action_id" varchar(36) NOT NULL REFERENCES "promo_phone_actions"("id") ON DELETE CASCADE,
  "image_base64" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_phone_screenshots_action" ON "promo_phone_screenshots" ("action_id");

-- Where an account runs: a browser profile or a phone, never both. One account
-- per network per phone, the same rule as a profile.
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "phone_id" varchar(36)
    REFERENCES "promo_phones"("id") ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_promo_accounts_one_device'
  ) THEN
    ALTER TABLE "promo_accounts"
      ADD CONSTRAINT "ck_promo_accounts_one_device"
      CHECK ("profile_id" IS NULL OR "phone_id" IS NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_accounts_phone_platform"
  ON "promo_accounts" ("phone_id", "platform") WHERE "phone_id" IS NOT NULL;

-- The Phones dashboard in the left menu, under Anti Detect after the other
-- entries. Tyler's rule of 5 Oct 2026: devices are app-wide records with
-- their own dashboard. Every admin sidebar is a saved list on its workspace,
-- so the link joins the saved sections that already link to /admin/profiles.
-- A sidebar that already links to /admin/phones is left alone.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') = 'array'
          AND jsonb_path_exists("s"."section", '$.entries[*] ? (@.href == "/admin/profiles")')
        THEN jsonb_set(
          "s"."section",
          '{entries}',
          ("s"."section"->'entries') || jsonb_build_array(jsonb_build_object(
            'id', 'item-promo-phones',
            'href', '/admin/phones',
            'icon', 'smartphone',
            'type', 'item',
            'label', 'Phones',
            'visible', true
          ))
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
  AND jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/profiles")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/phones")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/phones")');
