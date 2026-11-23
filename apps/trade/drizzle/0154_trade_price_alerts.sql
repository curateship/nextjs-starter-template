CREATE TABLE "trade_price_alerts" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "protocol" varchar(20) NOT NULL,
  "network" varchar(10) NOT NULL,
  "market_key" varchar(180) NOT NULL,
  "price" double precision NOT NULL,
  "direction" varchar(5) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "fired_at" timestamp with time zone,
  PRIMARY KEY ("user_id", "id"),
  CONSTRAINT "trade_price_alerts_direction_check"
    CHECK ("direction" IN ('above', 'below')),
  CONSTRAINT "trade_price_alerts_price_check" CHECK ("price" > 0)
);

CREATE INDEX "trade_price_alerts_armed_user_idx"
  ON "trade_price_alerts" ("user_id", "created_at")
  WHERE "fired_at" IS NULL;

CREATE INDEX "trade_price_alerts_armed_market_idx"
  ON "trade_price_alerts" ("market_key")
  WHERE "fired_at" IS NULL;

ALTER TABLE "trade_prefs"
ADD COLUMN IF NOT EXISTS "trade_alert_sounds_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "trade_notice_links"
DROP CONSTRAINT IF EXISTS "trade_notice_links_sound_kind_check";

ALTER TABLE "trade_notice_links"
ADD CONSTRAINT "trade_notice_links_sound_kind_check"
CHECK ("sound_kind" IS NULL OR "sound_kind" IN ('fill', 'stop', 'alert'));
