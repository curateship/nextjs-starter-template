-- What file 05 adds: a limit on open browsers, jobs that run side by side per
-- profile, and backups of a profile's cookies.
--
-- Additions only.

-- The machine's browser settings, one row. How many browsers may be open at
-- once, and how long an unused one stays open. Read by the browser program and
-- the ticker, changed in Settings. The row is made here so there is always one.
CREATE TABLE IF NOT EXISTS "promo_browser_settings" (
  "id" varchar(20) PRIMARY KEY,
  "max_open" integer NOT NULL DEFAULT 3,
  "idle_minutes" integer NOT NULL DEFAULT 60,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "promo_browser_settings" ("id") VALUES ('default')
ON CONFLICT ("id") DO NOTHING;

-- Which profile a job works in. Jobs in one lane run one at a time, in order,
-- because a browser has one page and one driver; jobs in different lanes run
-- side by side. Null on jobs from before lanes, each of which is its own lane.
ALTER TABLE "promo_jobs"
  ADD COLUMN IF NOT EXISTS "lane" varchar(36);

CREATE INDEX IF NOT EXISTS "ix_promo_jobs_lane_running"
  ON "promo_jobs" ("lane")
  WHERE "status" = 'running';

-- A backup of a profile's volume, encrypted and kept in R2. The object key is
-- the only way to it; the bytes are unreadable without the server's key.
CREATE TABLE IF NOT EXISTS "promo_profile_backups" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" varchar(36) NOT NULL REFERENCES "promo_profiles"("id") ON DELETE CASCADE,
  "object_key" varchar(300) NOT NULL,
  -- The encrypted size, which is what R2 holds.
  "size_bytes" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_profile_backups_profile"
  ON "promo_profile_backups" ("profile_id", "created_at" DESC);
