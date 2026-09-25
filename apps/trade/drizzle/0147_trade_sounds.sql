-- One account switch, off until the person turns it on.
ALTER TABLE "trade_prefs"
ADD COLUMN IF NOT EXISTS "trade_sounds_enabled" boolean NOT NULL DEFAULT false;

-- The notice remains the one-per-event record. Its app-owned metadata now also
-- says which sound the open trading screen should play. An address is optional
-- because a sound still matters when an exchange has no dashboard route here.
ALTER TABLE "trade_notice_links"
ALTER COLUMN "href" DROP NOT NULL;

ALTER TABLE "trade_notice_links"
ADD COLUMN IF NOT EXISTS "sound_kind" varchar(8);

ALTER TABLE "trade_notice_links"
ADD CONSTRAINT "trade_notice_links_sound_kind_check"
CHECK ("sound_kind" IS NULL OR "sound_kind" IN ('fill', 'stop'));
