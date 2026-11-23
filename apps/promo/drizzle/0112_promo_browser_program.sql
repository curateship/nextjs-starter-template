-- The browser program checks in here while it runs, so the site can say when
-- it is not running and jobs are only piling up. Tyler, 13 Oct 2026, after
-- his searches sat waiting for a day with no sign why: "should there be jobs
-- visible somewhere in the settings so I can see what's running?"
--
-- One row per running copy, named by the claim token it takes jobs under.
-- A copy stopped cleanly deletes its row; one that was killed leaves a row
-- whose seen_at goes stale, and the next copy to start clears rows a day old.
CREATE TABLE IF NOT EXISTS "promo_browser_program" (
  "id" varchar(36) PRIMARY KEY,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "seen_at" timestamptz NOT NULL DEFAULT now(),
  "lanes" integer NOT NULL DEFAULT 0
);
