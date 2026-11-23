-- Date's phone link: the member's own Android phone running the Date app,
-- the codes that pair it, the random words its signed messages carry once,
-- the plain actions the server asks it to run, and the pictures kept from
-- them. Task "tinder/01", part 1. The Drizzle side is
-- `src/server/phone/schema.ts`.
--
-- Additions only. Nothing stored is renamed or dropped.

-- One phone. Whether it is here is worked out from last_seen_at, which every
-- check-in writes. A phone whose key is null is unpaired and keeps its history.
CREATE TABLE IF NOT EXISTS "date_phones" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "model" varchar(120) NOT NULL DEFAULT '',
  "android_version" varchar(40) NOT NULL DEFAULT '',
  "app_version" varchar(40) NOT NULL DEFAULT '',
  "key_encrypted" text,
  "paired_at" timestamptz,
  "last_seen_at" timestamptz,
  "battery_percent" integer,
  "time_zone" varchar(64) NOT NULL DEFAULT '',
  "tinder_version" varchar(60) NOT NULL DEFAULT '',
  "tinder_in_front" boolean NOT NULL DEFAULT false,
  -- The "Date is in control" switch on the Phone screen, and the same switch
  -- on the phone itself as it last reported. The phone is handed actions only
  -- while both are on.
  "in_control" boolean NOT NULL DEFAULT true,
  "phone_switch_on" boolean NOT NULL DEFAULT true,
  -- Start and Stop on the dashboard, and why the loop last ended.
  "running" boolean NOT NULL DEFAULT false,
  "running_since" timestamptz,
  "stop_why" text NOT NULL DEFAULT '',
  "stop_why_at" timestamptz,
  -- A Tinder screen that stops everything until Resume: out of likes, a
  -- verification wall, under review, banned, update required, not signed in.
  "stopped_reason" varchar(40),
  "stopped_at" timestamptz,
  "stopped_words" text NOT NULL DEFAULT '',
  "stopped_picture_id" varchar(36),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_date_phones_user" ON "date_phones" ("user_id", "workspace_id");

-- Six-digit codes shown once on the Phone screen. Only a hash is kept, and a
-- code works once, for ten minutes.
CREATE TABLE IF NOT EXISTS "date_phone_pair_codes" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) REFERENCES "date_phones"("id") ON DELETE CASCADE,
  "code_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_date_phone_pair_codes_hash" ON "date_phone_pair_codes" ("code_hash");

-- Every signed message carries a random word used once. A copied message sent
-- again finds its word here and is refused.
CREATE TABLE IF NOT EXISTS "date_phone_nonces" (
  "phone_id" varchar(36) NOT NULL REFERENCES "date_phones"("id") ON DELETE CASCADE,
  "nonce" varchar(64) NOT NULL,
  "seen_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("phone_id", "nonce")
);

CREATE INDEX IF NOT EXISTS "ix_date_phone_nonces_seen" ON "date_phone_nonces" ("seen_at");

-- One plain action for one phone: open an app, read the screen, tap, swipe,
-- type, back, home or take a picture. "screenshot" holds the phone's picture
-- only until whoever asked has used it.
CREATE TABLE IF NOT EXISTS "date_phone_actions" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "phone_id" varchar(36) NOT NULL REFERENCES "date_phones"("id") ON DELETE CASCADE,
  "walk_id" varchar(36),
  "kind" varchar(30) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "answer" jsonb,
  "error" text NOT NULL DEFAULT '',
  "screenshot" text,
  "picture_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "time_limit_seconds" integer NOT NULL DEFAULT 30,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "finished_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ix_date_phone_actions_phone" ON "date_phone_actions" ("phone_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_date_phone_actions_walk" ON "date_phone_actions" ("walk_id");

-- Pictures kept from the phone, encrypted in R2. The same bytes are kept once
-- per member. A sample picture points at a drawing in public/sample/dating/.
CREATE TABLE IF NOT EXISTS "date_pictures" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(10) NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "object_key" varchar(300) NOT NULL DEFAULT '',
  "sample_path" varchar(200) NOT NULL DEFAULT '',
  "width" integer,
  "height" integer,
  "bytes" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_date_pictures_user_sha" ON "date_pictures" ("user_id", "sha256");
CREATE INDEX IF NOT EXISTS "ix_date_pictures_kind_created" ON "date_pictures" ("kind", "created_at");
