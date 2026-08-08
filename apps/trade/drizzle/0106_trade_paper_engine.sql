-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- The practice trading engine: what a paper wallet is holding, what it has
-- asked for, and everything that has already happened to it.
--
-- There is no cash column anywhere on purpose. A wallet's cash is its starting
-- balance plus every journal row's profit less its fee, worked out on read —
-- a stored copy would be a second answer to a question that already has one.
-- The same goes for margin and liquidation prices: both are arithmetic on the
-- position's own figures, so they are derived, never written down.
--
-- Every table is keyed by the person and hangs off `trade_wallets` by the pair
-- (user_id, wallet_id), so deleting a wallet takes its whole trading history
-- with it and a request carrying somebody else's wallet id can only ever miss.

-- One position per wallet per market. `szi` is signed: positive is long,
-- negative is short. `leverage` is fixed when the position opens and inherited
-- by anything added to it; `max_leverage` is the market's own limit copied at
-- that moment, because the liquidation estimate is built from it and the
-- exchange can change its answer under a position that is already open.
CREATE TABLE IF NOT EXISTS "trade_paper_positions" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "szi" double precision NOT NULL,
  "entry_px" double precision NOT NULL,
  "leverage" double precision NOT NULL,
  "max_leverage" double precision NOT NULL,
  "tp_px" double precision,
  "sl_px" double precision,
  "fees_paid" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE
);

-- One market, one position: an order that adds to what is already held moves
-- the entry price instead of opening a second row beside it.
CREATE UNIQUE INDEX IF NOT EXISTS "trade_paper_positions_market_idx"
  ON "trade_paper_positions" ("user_id", "wallet_id", "market_key");

-- Only orders still waiting live here. Filling or cancelling one deletes the
-- row — the journal is where history lives, and two histories would drift.
-- `tp_px`/`sl_px` are the brackets to hand the position this order opens.
CREATE TABLE IF NOT EXISTS "trade_paper_orders" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "side" varchar(4) NOT NULL,
  "px" double precision NOT NULL,
  "sz" double precision NOT NULL,
  "leverage" double precision NOT NULL,
  "max_leverage" double precision NOT NULL,
  "reduce_only" boolean NOT NULL DEFAULT false,
  "tp_px" double precision,
  "sl_px" double precision,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "trade_paper_orders_wallet_idx"
  ON "trade_paper_orders" ("user_id", "wallet_id");

-- Every fill that ever happened, and why. This is both the trade history the
-- Journal tab shows and the ledger the wallet's cash is added up from, which
-- is why nothing is ever pruned from it.
CREATE TABLE IF NOT EXISTS "trade_paper_journal" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "side" varchar(4) NOT NULL,
  "px" double precision NOT NULL,
  "sz" double precision NOT NULL,
  "fee" double precision NOT NULL,
  "closed_pnl" double precision NOT NULL DEFAULT 0,
  "reason" varchar(16) NOT NULL,
  "fill_time" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "trade_paper_journal_wallet_idx"
  ON "trade_paper_journal" ("user_id", "wallet_id", "fill_time");

-- How far the engine has replayed each wallet. Nothing runs in the background:
-- reading an account first replays the candles since this moment, so a wallet
-- left alone for a day catches up the moment somebody looks at it.
CREATE TABLE IF NOT EXISTS "trade_paper_state" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wallet_id" varchar(36) NOT NULL,
  "settled_to" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "wallet_id"),
  FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE
);
