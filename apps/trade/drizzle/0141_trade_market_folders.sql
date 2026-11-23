CREATE TABLE "trade_market_folders" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "protocol" varchar(20) NOT NULL,
  "network" varchar(10) NOT NULL,
  "name" varchar(80) NOT NULL,
  "is_fav" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "ux_trade_market_folders_scope_name"
  ON "trade_market_folders" ("user_id", "protocol", "network", lower("name"));
CREATE UNIQUE INDEX "ux_trade_market_folders_scope_fav"
  ON "trade_market_folders" ("user_id", "protocol", "network")
  WHERE "is_fav" = true;
CREATE INDEX "ix_trade_market_folders_scope_position"
  ON "trade_market_folders" ("user_id", "protocol", "network", "position");

CREATE TABLE "trade_market_folder_items" (
  "folder_id" varchar(36) NOT NULL REFERENCES "trade_market_folders"("id") ON DELETE CASCADE,
  "market_key" varchar(180) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("folder_id", "market_key")
);

CREATE INDEX "ix_trade_market_folder_items_market"
  ON "trade_market_folder_items" ("market_key");

WITH scopes AS (
  SELECT DISTINCT
    favorites.user_id,
    split_part(keys.market_key, ':', 1) AS protocol,
    split_part(keys.market_key, ':', 2) AS network
  FROM "trade_market_favorites" favorites
  CROSS JOIN LATERAL jsonb_array_elements_text(favorites.market_keys) keys(market_key)
  WHERE split_part(keys.market_key, ':', 3) <> ''
)
INSERT INTO "trade_market_folders" (
  id, user_id, protocol, network, name, is_fav, position
)
SELECT gen_random_uuid()::text, user_id, protocol, network, 'Fav', true, 0
FROM scopes
ON CONFLICT DO NOTHING;

INSERT INTO "trade_market_folder_items" (folder_id, market_key)
SELECT folders.id, keys.market_key
FROM "trade_market_favorites" favorites
CROSS JOIN LATERAL jsonb_array_elements_text(favorites.market_keys) keys(market_key)
JOIN "trade_market_folders" folders
  ON folders.user_id = favorites.user_id
 AND folders.protocol = split_part(keys.market_key, ':', 1)
 AND folders.network = split_part(keys.market_key, ':', 2)
 AND folders.is_fav = true
ON CONFLICT DO NOTHING;
