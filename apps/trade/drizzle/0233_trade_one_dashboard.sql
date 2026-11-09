-- One Trade dashboard at /trade (Tyler, 8 Nov 2026: "consolidate everything
-- into one 3 panel dashboard. The protocols now goes into the left panel as a
-- block"). Only additions, so a database that still serves the old screens
-- keeps working until they are replaced.
--
-- The left page is one per person now, not one per exchange, and it starts
-- fresh ("Start fresh"): nothing is copied over from "trade_pages", whose
-- exchange pages and All markets pages are no longer read. That table stays
-- until the old screens are gone everywhere, then a later migration drops it.
--
-- No row means the page was never written, and the app shows the starting
-- page: the Protocols block, then the seven trading blocks. A locked page
-- reads only, and the server refuses a save.
CREATE TABLE IF NOT EXISTS "trade_dashboard_pages" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "locked" boolean NOT NULL DEFAULT false,
  "cover_url" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Overview's widgets in the shell's rows, one layout per person ("Per
-- account", "Shell's rows, fresh start"). Null until the first change, which
-- reads as the starting layout. The old "dashboard_widgets" arrangement
-- (top, left and right lists) is not read any more and is left as it was.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "overview_widgets" jsonb;

-- The row of the Protocols block picked last, so a bare /trade opens on it
-- ("Last one you had"): 'overview' or an exchange's id. And the exchange
-- picked last, whose blocks the left page keeps showing on Overview ("Last
-- exchange you had").
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "dashboard_view" varchar(20);
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "dashboard_protocol" varchar(20);

-- The exchanges hidden from the Protocols block in the left page's ⋮ ("Pick
-- in the ⋮"). Empty lists all eleven.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "hidden_protocols" jsonb NOT NULL DEFAULT '[]'::jsonb;
