-- Public trader profiles, and the permanent trade record they read from.
--
-- The profile shows what a member's real wallets made and lost. Two things in
-- the everyday tables would let a member clean that up: deleting a wallet
-- deletes its fills through the cascade on trade_live_fills, and binning a
-- Journal row sets `hidden` on the fill. So the profile never reads those
-- tables. It reads trade_record_fills, which the database itself fills from
-- every write to trade_live_fills, whoever made it, and which no member action
-- deletes. Only deleting the whole account removes it.
--
-- Nothing existing is changed or dropped. The three triggers only add rows to
-- the new tables.

CREATE TABLE IF NOT EXISTS "trade_public_profiles" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "handle" varchar(20) NOT NULL,
  "display_name" varchar(60) NOT NULL,
  "picture" text,
  "bio" varchar(280) NOT NULL DEFAULT '',
  "links" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "enabled" boolean NOT NULL DEFAULT false,
  "searchable" boolean NOT NULL DEFAULT false,
  "hidden_at" timestamp with time zone,
  "hidden_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "trade_public_profiles_handle_check" CHECK ("handle" ~ '^[a-z][a-z0-9_]{2,19}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "trade_public_profiles_handle_idx"
  ON "trade_public_profiles" ("handle");

-- A handle somebody gave up, held for 90 days so nobody can take over a known
-- name at once. No foreign key: the hold outlives a deleted account too.
CREATE TABLE IF NOT EXISTS "trade_public_handle_holds" (
  "handle" varchar(20) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL,
  "released_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "trade_public_reports" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "reason" varchar(500) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "trade_public_reports_user_idx"
  ON "trade_public_reports" ("user_id", "created_at");

-- Every real-money wallet on a real network a member has ever saved. A deleted
-- wallet keeps its row with `removed_at` set. `proof` is the last ownership
-- check: 'proved', 'failed', or NULL when none has run since the migration.
CREATE TABLE IF NOT EXISTS "trade_record_wallets" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "wallet_id" varchar(36) NOT NULL,
  "protocol" varchar(20) NOT NULL,
  "address" varchar(64),
  "label" varchar(40) NOT NULL,
  "added_at" timestamp with time zone NOT NULL DEFAULT now(),
  "removed_at" timestamp with time zone,
  "proof" varchar(8),
  "proof_note" text,
  "proof_checked_at" timestamp with time zone,
  PRIMARY KEY ("user_id", "wallet_id"),
  CONSTRAINT "trade_record_wallets_proof_check" CHECK ("proof" IS NULL OR "proof" IN ('proved', 'failed'))
);

-- The fills of those wallets, binned or not. `frozen` rows belong to a
-- removed wallet: their `money` was worked out the moment it was removed,
-- while its grids still existed to price them, and never changes again.
CREATE TABLE IF NOT EXISTS "trade_record_fills" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "fill_id" varchar(128) NOT NULL,
  "order_id" varchar(128) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "side" varchar(4) NOT NULL,
  "px" double precision NOT NULL,
  "sz" double precision NOT NULL,
  "at" bigint NOT NULL,
  "closed_pnl" double precision NOT NULL DEFAULT 0,
  "fee" double precision NOT NULL DEFAULT 0,
  "dir" varchar(24) NOT NULL DEFAULT '',
  "liquidation" boolean NOT NULL DEFAULT false,
  "frozen" boolean NOT NULL DEFAULT false,
  "money" double precision,
  PRIMARY KEY ("user_id", "wallet_id", "fill_id"),
  FOREIGN KEY ("user_id", "wallet_id") REFERENCES "trade_record_wallets" ("user_id", "wallet_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "trade_record_fills_time_idx"
  ON "trade_record_fills" ("user_id", "at");
CREATE INDEX IF NOT EXISTS "trade_record_fills_fill_idx"
  ON "trade_record_fills" ("user_id", "fill_id");

-- A live mainnet wallet joins the record the moment it is saved. A new label
-- follows it; the address it was saved with never changes here.
CREATE OR REPLACE FUNCTION trade_record_wallet_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'live' AND NEW.network = 'mainnet' THEN
    INSERT INTO trade_record_wallets (user_id, wallet_id, protocol, address, label, added_at)
    VALUES (NEW.user_id, NEW.id, NEW.protocol, NEW.address, NEW.label, NEW.created_at)
    ON CONFLICT (user_id, wallet_id) DO UPDATE SET label = EXCLUDED.label;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_record_wallet_keep ON trade_wallets;
CREATE TRIGGER trade_record_wallet_keep AFTER INSERT OR UPDATE OF label ON trade_wallets
  FOR EACH ROW EXECUTE FUNCTION trade_record_wallet_keep();

-- Deleting a wallet marks it removed. Skipped while the whole account is being
-- deleted, when the record goes with the account.
CREATE OR REPLACE FUNCTION trade_record_wallet_removed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind = 'live' AND OLD.network = 'mainnet'
     AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
    UPDATE trade_record_wallets SET removed_at = now()
      WHERE user_id = OLD.user_id AND wallet_id = OLD.id AND removed_at IS NULL;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trade_record_wallet_removed ON trade_wallets;
CREATE TRIGGER trade_record_wallet_removed AFTER DELETE ON trade_wallets
  FOR EACH ROW EXECUTE FUNCTION trade_record_wallet_removed();

-- Every fill write is copied, and a later correction (KuCoin states a sale's
-- money after the position closes) is copied over it. `hidden` is never read,
-- so binning changes nothing here. A fill already held under another wallet
-- with the same exchange and address, which is what re-adding a deleted
-- wallet produces, is not copied twice.
CREATE OR REPLACE FUNCTION trade_record_fill_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO trade_record_fills (user_id, wallet_id, fill_id, order_id, market_key, side, px, sz, at, closed_pnl, fee, dir, liquidation)
  SELECT NEW.user_id, NEW.wallet_id, NEW.fill_id, NEW.order_id, NEW.market_key, NEW.side, NEW.px, NEW.sz, NEW.at, NEW.closed_pnl, NEW.fee, NEW.dir, NEW.liquidation
  FROM trade_record_wallets kept
  WHERE kept.user_id = NEW.user_id AND kept.wallet_id = NEW.wallet_id AND kept.removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM trade_record_fills other
      JOIN trade_record_wallets owner ON owner.user_id = other.user_id AND owner.wallet_id = other.wallet_id
      WHERE other.user_id = NEW.user_id AND other.fill_id = NEW.fill_id AND other.wallet_id <> NEW.wallet_id
        AND owner.protocol = kept.protocol AND owner.address IS NOT DISTINCT FROM kept.address
    )
  ON CONFLICT (user_id, wallet_id, fill_id) DO UPDATE SET
    order_id = EXCLUDED.order_id, market_key = EXCLUDED.market_key, side = EXCLUDED.side,
    px = EXCLUDED.px, sz = EXCLUDED.sz, at = EXCLUDED.at, closed_pnl = EXCLUDED.closed_pnl,
    fee = EXCLUDED.fee, dir = EXCLUDED.dir, liquidation = EXCLUDED.liquidation
    WHERE NOT trade_record_fills.frozen;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_record_fill_keep ON trade_live_fills;
CREATE TRIGGER trade_record_fill_keep
  AFTER INSERT OR UPDATE OF order_id, market_key, side, px, sz, at, closed_pnl, fee, dir, liquidation ON trade_live_fills
  FOR EACH ROW EXECUTE FUNCTION trade_record_fill_keep();

-- Everything already saved joins the record, binned fills included.
INSERT INTO trade_record_wallets (user_id, wallet_id, protocol, address, label, added_at)
SELECT user_id, id, protocol, address, label, created_at FROM trade_wallets
WHERE kind = 'live' AND network = 'mainnet'
ON CONFLICT (user_id, wallet_id) DO NOTHING;

INSERT INTO trade_record_fills (user_id, wallet_id, fill_id, order_id, market_key, side, px, sz, at, closed_pnl, fee, dir, liquidation)
SELECT f.user_id, f.wallet_id, f.fill_id, f.order_id, f.market_key, f.side, f.px, f.sz, f.at, f.closed_pnl, f.fee, f.dir, f.liquidation
FROM trade_live_fills f
JOIN trade_record_wallets kept ON kept.user_id = f.user_id AND kept.wallet_id = f.wallet_id
ON CONFLICT (user_id, wallet_id, fill_id) DO NOTHING;
