-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- The Journal tab: finished real trades, with what each one made and what
-- ended it.
--
-- Neither of those questions can be answered from what the app already keeps.
-- `trade_live_journal` records what this app ASKED the exchange for; it has no
-- money banked, no fee and no reason, and it has never heard of a trade placed
-- from the exchange's own site or a stop that fired overnight. So the fills
-- themselves are kept, in the exchange's own figures, and everything the
-- Journal shows is arithmetic on these rows.
CREATE TABLE IF NOT EXISTS "trade_live_fills" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  -- The exchange's own trade id. It is the primary key's last part, which is
  -- what makes a sweep that overlaps the sweep before it harmless.
  "fill_id" varchar(40) NOT NULL,
  "order_id" varchar(40) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "side" varchar(4) NOT NULL,
  "px" double precision NOT NULL,
  "sz" double precision NOT NULL,
  -- Epoch milliseconds, the exchange's clock rather than ours.
  "at" bigint NOT NULL,
  -- The venue's own accounting, copied rather than worked out. A subtraction
  -- of our own would disagree with the account the moment funding or a partial
  -- close is involved, and the number that disagrees with the exchange is the
  -- wrong one.
  "closed_pnl" double precision NOT NULL DEFAULT 0,
  "fee" double precision NOT NULL DEFAULT 0,
  "dir" varchar(24) NOT NULL DEFAULT '',
  "liquidation" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("user_id", "wallet_id", "fill_id")
);

-- The Journal reads one wallet's fills for one market, in time order, which is
-- exactly this.
CREATE INDEX IF NOT EXISTS "trade_live_fills_market_idx"
  ON "trade_live_fills" ("user_id", "wallet_id", "market_key", "at");

-- A deleted wallet takes its history with it, the same as every other table
-- hung off trade_wallets.
DO $$ BEGIN
  ALTER TABLE "trade_live_fills"
    ADD CONSTRAINT "trade_live_fills_wallet_fk"
    FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- What each order turned out to be, so a sell can be told from a stop.
--
-- The exchange reports a stop firing as an ordinary sell; what makes it a stop
-- is the order behind it. Two things fill this in. Stops and targets seen
-- sitting on a position are written down as the poll goes past them, and any
-- closing order still unaccounted for is simply ASKED about — the exchange
-- remembers every order long after it is gone, which is what lets a trade from
-- months ago say "Stopped out" instead of a shrug.
--
-- "It was an ordinary order" is stored too, as `none`. Without it every plain
-- close would be asked about again on every sweep, forever.
CREATE TABLE IF NOT EXISTS "trade_live_triggers" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "order_id" varchar(40) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  -- stop | target | none
  "kind" varchar(8) NOT NULL,
  -- Where it was set to fire. Zero means no longer knowable: the exchange
  -- clears a trigger price once it has fired, so an order recovered after the
  -- fact says it WAS a stop without inventing where.
  "px" double precision NOT NULL,
  "seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "wallet_id", "order_id")
);

DO $$ BEGIN
  ALTER TABLE "trade_live_triggers"
    ADD CONSTRAINT "trade_live_triggers_wallet_fk"
    FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
