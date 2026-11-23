-- Profiles (task "features/06-profiles", Tyler, 20 Oct 2026): one member runs
-- several dating profiles, each one dating app's account, with its own phone,
-- settings, cards, chats, walks, own profile, Google Calendar and AI spend.
-- Called accounts here because "date_profiles" already means a card.
--
-- Everything already kept moves into a first profile: one per phone, named
-- after the name on that phone's own profile or "Tinder", and one for a
-- member with Dating records and no phone. Records with no phone (the
-- samples) go to the member's first profile. Settings and a Google Calendar
-- are copied to each profile of their member, which only matters for a member
-- with two phones.
--
-- Nothing stored is renamed. The settings and calendar keep their member and
-- site columns; only their primary key moves to the profile.

CREATE TABLE IF NOT EXISTS "date_accounts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "app" varchar(10) NOT NULL DEFAULT 'tinder',
  "name" varchar(80) NOT NULL,
  "phone_id" varchar(36) REFERENCES "date_phones"("id") ON DELETE SET NULL,
  "paused_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_date_accounts_user" ON "date_accounts" ("user_id", "workspace_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_date_accounts_phone_app" ON "date_accounts" ("phone_id", "app") WHERE "phone_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "date_account_picks" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "date_accounts"("id") ON DELETE CASCADE,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "workspace_id")
);

-- A profile for every phone.
INSERT INTO "date_accounts" ("id", "user_id", "workspace_id", "app", "name", "phone_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, p."user_id", p."workspace_id", 'tinder',
       coalesce(nullif(left(trim(o."name"), 80), ''), 'Tinder'), p."id", p."created_at", now()
FROM "date_phones" p
LEFT JOIN "date_own_profile" o ON o."phone_id" = p."id"
WHERE NOT EXISTS (SELECT 1 FROM "date_accounts" a WHERE a."phone_id" = p."id");

-- A profile for a member with Dating records and no phone.
INSERT INTO "date_accounts" ("id", "user_id", "workspace_id", "app", "name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, o."user_id", o."workspace_id", 'tinder', 'Tinder', now(), now()
FROM (
  SELECT "user_id", "workspace_id" FROM "date_settings"
  UNION SELECT "user_id", "workspace_id" FROM "date_profiles"
  UNION SELECT "user_id", "workspace_id" FROM "date_matches"
  UNION SELECT "user_id", "workspace_id" FROM "date_google_calendars"
) o
WHERE NOT EXISTS (SELECT 1 FROM "date_accounts" a WHERE a."user_id" = o."user_id" AND a."workspace_id" = o."workspace_id");

-- Cards and chats: their phone's profile, else the member's first.
ALTER TABLE "date_profiles" ADD COLUMN IF NOT EXISTS "account_id" varchar(36) REFERENCES "date_accounts"("id") ON DELETE CASCADE;
UPDATE "date_profiles" c SET "account_id" = a."id"
FROM "date_accounts" a WHERE c."account_id" IS NULL AND a."phone_id" = c."phone_id";
UPDATE "date_profiles" c SET "account_id" = (
  SELECT a."id" FROM "date_accounts" a
  WHERE a."user_id" = c."user_id" AND a."workspace_id" = c."workspace_id"
  ORDER BY a."created_at", a."id" LIMIT 1
) WHERE c."account_id" IS NULL;
ALTER TABLE "date_profiles" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_date_profiles_account_read" ON "date_profiles" ("account_id", "read_at" DESC);

ALTER TABLE "date_matches" ADD COLUMN IF NOT EXISTS "account_id" varchar(36) REFERENCES "date_accounts"("id") ON DELETE CASCADE;
UPDATE "date_matches" m SET "account_id" = a."id"
FROM "date_accounts" a WHERE m."account_id" IS NULL AND a."phone_id" = m."phone_id";
UPDATE "date_matches" m SET "account_id" = (
  SELECT a."id" FROM "date_accounts" a
  WHERE a."user_id" = m."user_id" AND a."workspace_id" = m."workspace_id"
  ORDER BY a."created_at", a."id" LIMIT 1
) WHERE m."account_id" IS NULL;
ALTER TABLE "date_matches" ALTER COLUMN "account_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_date_matches_account" ON "date_matches" ("account_id", "last_message_at" DESC);

-- Walks always have a phone.
ALTER TABLE "date_walks" ADD COLUMN IF NOT EXISTS "account_id" varchar(36) REFERENCES "date_accounts"("id") ON DELETE CASCADE;
UPDATE "date_walks" w SET "account_id" = a."id"
FROM "date_accounts" a WHERE w."account_id" IS NULL AND a."phone_id" = w."phone_id";
ALTER TABLE "date_walks" ALTER COLUMN "account_id" SET NOT NULL;

-- The own profile was one per phone; it is one per profile.
ALTER TABLE "date_own_profile" ADD COLUMN IF NOT EXISTS "account_id" varchar(36) REFERENCES "date_accounts"("id") ON DELETE CASCADE;
UPDATE "date_own_profile" o SET "account_id" = a."id"
FROM "date_accounts" a WHERE o."account_id" IS NULL AND a."phone_id" = o."phone_id";
ALTER TABLE "date_own_profile" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "date_own_profile" DROP CONSTRAINT IF EXISTS "date_own_profile_pkey";
ALTER TABLE "date_own_profile" ADD PRIMARY KEY ("account_id");

-- Settings and the Google Calendar: one row per profile.
ALTER TABLE "date_settings" ADD COLUMN IF NOT EXISTS "account_id" varchar(36) REFERENCES "date_accounts"("id") ON DELETE CASCADE;
ALTER TABLE "date_settings" DROP CONSTRAINT IF EXISTS "date_settings_pkey";
UPDATE "date_settings" s SET "account_id" = (
  SELECT a."id" FROM "date_accounts" a
  WHERE a."user_id" = s."user_id" AND a."workspace_id" = s."workspace_id"
  ORDER BY a."created_at", a."id" LIMIT 1
) WHERE s."account_id" IS NULL;
INSERT INTO "date_settings" ("account_id", "user_id", "workspace_id", "values", "updated_at")
SELECT a."id", s."user_id", s."workspace_id", s."values", s."updated_at"
FROM "date_settings" s
JOIN "date_accounts" a ON a."user_id" = s."user_id" AND a."workspace_id" = s."workspace_id" AND a."id" <> s."account_id";
ALTER TABLE "date_settings" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "date_settings" ADD PRIMARY KEY ("account_id");

ALTER TABLE "date_google_calendars" ADD COLUMN IF NOT EXISTS "account_id" varchar(36) REFERENCES "date_accounts"("id") ON DELETE CASCADE;
ALTER TABLE "date_google_calendars" DROP CONSTRAINT IF EXISTS "date_google_calendars_pkey";
UPDATE "date_google_calendars" g SET "account_id" = (
  SELECT a."id" FROM "date_accounts" a
  WHERE a."user_id" = g."user_id" AND a."workspace_id" = g."workspace_id"
  ORDER BY a."created_at", a."id" LIMIT 1
) WHERE g."account_id" IS NULL;
-- The calendar stays with the first profile only. A copy would share one
-- Google sign-in, and disconnecting either profile cancels it for both.
ALTER TABLE "date_google_calendars" ALTER COLUMN "account_id" SET NOT NULL;
ALTER TABLE "date_google_calendars" ADD PRIMARY KEY ("account_id");

-- A pairing code names the profile the phone is paired for. Codes made
-- before this name none; they last ten minutes, so they go, and a new one is
-- made in the Phone panel.
DELETE FROM "date_phone_pair_codes";
ALTER TABLE "date_phone_pair_codes" ADD COLUMN IF NOT EXISTS "account_id" varchar(36) NOT NULL REFERENCES "date_accounts"("id") ON DELETE CASCADE;

-- Dating AI calls already made are tied to the profile whose card, chat or
-- phone they were about, else to the member's first profile, so this month's
-- spend stays counted.
UPDATE "ai_usage_events" e SET "metadata" = e."metadata" || jsonb_build_object('accountId', coalesce(
  (SELECT c."account_id" FROM "date_profiles" c WHERE c."id" = e."metadata"->>'profileId'),
  (SELECT m."account_id" FROM "date_matches" m WHERE m."id" = e."metadata"->>'matchId'),
  (SELECT a."id" FROM "date_accounts" a WHERE a."phone_id" = e."metadata"->>'phoneId' ORDER BY a."created_at" LIMIT 1),
  (SELECT a."id" FROM "date_accounts" a WHERE a."user_id" = e."user_id" ORDER BY a."created_at", a."id" LIMIT 1)
))
WHERE e."feature" LIKE 'dating-%'
  AND NOT (e."metadata" ? 'accountId')
  AND EXISTS (SELECT 1 FROM "date_accounts" a WHERE a."user_id" = e."user_id");

-- Saved views on the lead list are each profile's own (`dating:<profile id>`);
-- ones kept before go to the member's first profile.
UPDATE "saved_views" v SET "screen" = 'dating:' || (
  SELECT a."id" FROM "date_accounts" a WHERE a."user_id" = v."user_id" ORDER BY a."created_at", a."id" LIMIT 1
)
WHERE v."screen" = 'dating:'
  AND EXISTS (SELECT 1 FROM "date_accounts" a WHERE a."user_id" = v."user_id");
