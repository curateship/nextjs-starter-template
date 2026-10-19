-- iPhones on the rack, and the settings that let a person see the rack as a
-- whole. Phone farm files 08 ("iPhones on the rack") and 09 ("Seeing the
-- rack").
--
-- Additions only. Nothing stored is renamed or dropped. `android_version`
-- keeps its name and holds the iOS version on an iPhone.

-- Which kind of phone the record is. Every stored row is an Android, which
-- the default says. The rack reports the kind on every check-in.
ALTER TABLE "promo_phones" ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'android';
ALTER TABLE "promo_phones" DROP CONSTRAINT IF EXISTS "ck_promo_phones_kind";
ALTER TABLE "promo_phones" ADD CONSTRAINT "ck_promo_phones_kind" CHECK ("kind" IN ('android', 'iphone'));

-- When the rack's WebDriverAgent signature runs out (Tyler, 18 Oct 2026: a
-- free Apple ID, which dies every 7 days). Null until a rack with iPhone
-- tools checks in. The bell rings a day before.
ALTER TABLE "promo_racks" ADD COLUMN IF NOT EXISTS "wda_expires_at" timestamptz;

-- A second self-test phone, one per kind, and the shelf's shape for the rack
-- map (Tyler, 18 Oct 2026: rows and columns typed in Settings → Phones).
ALTER TABLE "promo_phone_settings" ADD COLUMN IF NOT EXISTS "test_phone_iphone_id" varchar(36) REFERENCES "promo_phones"("id") ON DELETE SET NULL;
ALTER TABLE "promo_phone_settings" ADD COLUMN IF NOT EXISTS "self_test_iphone_at" timestamptz;
ALTER TABLE "promo_phone_settings" ADD COLUMN IF NOT EXISTS "shelf_rows" integer NOT NULL DEFAULT 2;
ALTER TABLE "promo_phone_settings" ADD COLUMN IF NOT EXISTS "shelf_columns" integer NOT NULL DEFAULT 5;

-- The self-test's answers and the app rollouts are kept per kind, so a step
-- broken on an Android never refuses an iPhone's jobs, and the other way
-- round. The stored rows are Android's.
ALTER TABLE "promo_phone_action_checks" ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'android';
ALTER TABLE "promo_phone_action_checks" DROP CONSTRAINT IF EXISTS "promo_phone_action_checks_pkey";
ALTER TABLE "promo_phone_action_checks" ADD PRIMARY KEY ("user_id", "action", "kind");
ALTER TABLE "promo_app_rollouts" ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'android';
ALTER TABLE "promo_app_rollouts" DROP CONSTRAINT IF EXISTS "promo_app_rollouts_pkey";
ALTER TABLE "promo_app_rollouts" ADD PRIMARY KEY ("user_id", "app", "kind");
