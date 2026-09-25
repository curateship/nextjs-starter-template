-- Where one of this app's bell notices came from, so clicking it opens that
-- page. One row per notice: the coin's chart for a fill, a stop or a
-- liquidation warning, and the run's own page for a flow that stopped.
--
-- Keyed by the announcement, which is how a trade notice is written, and
-- cascaded off it so retiring or deleting the notice takes the address with it.
CREATE TABLE "trade_notice_links" (
  "announcement_id" varchar(36) PRIMARY KEY REFERENCES "announcements"("id") ON DELETE CASCADE,
  "href" text NOT NULL
);
