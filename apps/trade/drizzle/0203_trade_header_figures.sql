-- The last two figures the header button was able to say, per person.
--
-- The button reads several exchanges, and a read where one of them stays quiet
-- has no total to show — so after a page reload it sat on two dashes until a
-- read landed with every venue answering. Measured on 4 October 2026: one read
-- at 8s with a venue missing, the next at 26s. Tyler: "Just show the old
-- numbers until theres a new one."
--
-- Kept in a table rather than in the browser, because this app runs inside an
-- embedded preview where localStorage writes are silently dropped, and rather
-- than in memory, because a rolling deploy would hand the next page load to a
-- container that had never seen them.
CREATE TABLE IF NOT EXISTS "trade_header_figures" (
  "user_id" varchar(36) PRIMARY KEY,
  "value" text NOT NULL,
  "profit" text NOT NULL,
  "profit_value" double precision NOT NULL,
  "measured_at" timestamptz NOT NULL DEFAULT now()
);
