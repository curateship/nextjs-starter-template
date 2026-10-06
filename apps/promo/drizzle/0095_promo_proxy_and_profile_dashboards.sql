-- What the Proxies and Browser profiles dashboards need beyond 0094.
--
-- Additions only. Nothing stored is renamed or dropped.

-- The kind of line a proxy is. Bought proxies are residential, mobile or
-- datacenter, and the three behave differently on a site that scores traffic.
-- Residential is the default because it is what promo is meant to run on.
ALTER TABLE "promo_proxies"
  ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'residential';

-- Each change of a proxy's outside address. One row per change, not per test,
-- so a proxy that holds one address for a month adds one row and one that
-- rotates every ten minutes shows itself. Trimmed per proxy by the code.
CREATE TABLE IF NOT EXISTS "promo_proxy_addresses" (
  "id" varchar(36) PRIMARY KEY,
  "proxy_id" varchar(36) NOT NULL REFERENCES "promo_proxies"("id") ON DELETE CASCADE,
  "ip" varchar(64) NOT NULL,
  "country" varchar(2) NOT NULL DEFAULT '',
  "seen_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_proxy_addresses_proxy"
  ON "promo_proxy_addresses" ("proxy_id", "seen_at" DESC);

-- How a browser's run ended: 'closed' by a person, 'idle' for an hour,
-- 'dead' when its container stopped on its own, 'failed' to start, or
-- 'replaced' after the browser program restarted. Blank on rows from before
-- this column, which the history reads from the status instead.
ALTER TABLE "promo_browser_sessions"
  ADD COLUMN IF NOT EXISTS "ended_by" varchar(20) NOT NULL DEFAULT '';

-- The proxy the browser opened with and the country it went out from, so a
-- dashboard can say an open browser is still on an old proxy, and warn when a
-- new proxy would move the profile to another country.
ALTER TABLE "promo_browser_sessions"
  ADD COLUMN IF NOT EXISTS "proxy_id" varchar(36)
    REFERENCES "promo_proxies"("id") ON DELETE SET NULL;
ALTER TABLE "promo_browser_sessions"
  ADD COLUMN IF NOT EXISTS "exit_country" varchar(2) NOT NULL DEFAULT '';

-- Things that happened to a profile that are not a run of its browser: its
-- proxy changed, its browser was found dead, an open was refused because the
-- proxy was dead.
CREATE TABLE IF NOT EXISTS "promo_profile_events" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" varchar(36) NOT NULL REFERENCES "promo_profiles"("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "detail" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_profile_events_profile"
  ON "promo_profile_events" ("profile_id", "created_at" DESC);

-- Folders and labels, copied from anti-detect. A label is the state a person
-- gives a profile (Ready, Warming, Banned); it is not whether its browser runs.
CREATE TABLE IF NOT EXISTS "promo_profile_folders" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_profile_folders_user_name"
  ON "promo_profile_folders" ("user_id", lower("name"));

CREATE TABLE IF NOT EXISTS "promo_profile_labels" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "color" varchar(20) NOT NULL DEFAULT 'slate',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_profile_labels_user_name"
  ON "promo_profile_labels" ("user_id", lower("name"));

-- Deleting a folder or a label leaves its profiles where they are, without it.
ALTER TABLE "promo_profiles"
  ADD COLUMN IF NOT EXISTS "folder_id" varchar(36)
    REFERENCES "promo_profile_folders"("id") ON DELETE SET NULL;
ALTER TABLE "promo_profiles"
  ADD COLUMN IF NOT EXISTS "label_id" varchar(36)
    REFERENCES "promo_profile_labels"("id") ON DELETE SET NULL;
ALTER TABLE "promo_profiles"
  ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
