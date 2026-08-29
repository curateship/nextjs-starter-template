ALTER TABLE "trade_wallets"
  ADD COLUMN "history_version" bigint NOT NULL DEFAULT 0,
  ADD COLUMN "paper_realized" double precision NOT NULL DEFAULT 0;

UPDATE "trade_wallets" AS wallet
SET "paper_realized" = totals.total
FROM (
  SELECT
    "user_id",
    "wallet_id",
    COALESCE(SUM("closed_pnl" - "fee"), 0) AS total
  FROM "trade_paper_journal"
  GROUP BY "user_id", "wallet_id"
) AS totals
WHERE wallet."user_id" = totals."user_id"
  AND wallet."id" = totals."wallet_id";
