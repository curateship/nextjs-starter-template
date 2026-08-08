-- Sites: the one deployment starts serving many of them.
--
-- Until now this app was one website. This table is what turns it into a
-- builder: each row is a site with its own address, its own name and its own
-- look, and the domain a visitor typed decides which one they get. Everything
-- later in the multisite set — pages, listings, members, service keys — hangs
-- off the id created here.
--
-- Deliberately narrower than the directory app's version of the same idea:
--
--   * No owner column. An admin manages every site, so there is nobody to
--     scope a site to and no per-user check to write.
--   * No template flag. Copying a site to start another is not in this
--     version.
--   * Nothing about proving a domain or wiring it into the server. A custom
--     domain here is a field somebody types; the DNS record is pointed at this
--     server by hand.
--
-- `cms` in the file name rather than `custom_shell`: this migration belongs to
-- the app, so a future shell migration can take 0045_custom_shell_* without the
-- two colliding.

CREATE TABLE IF NOT EXISTS "sites" (
  "id" varchar(36) PRIMARY KEY,
  -- What the admin calls this site, and its title until one is set.
  "name" varchar(120) NOT NULL,
  -- A note for whoever runs the deployment; visitors never see it.
  "description" varchar(500) NOT NULL DEFAULT '',
  -- The label in front of the base domain — `alpha` in alpha.example.com.
  "subdomain" varchar(63) NOT NULL,
  -- A domain of the site's own, stored bare: no scheme, no port, no "www.",
  -- because that is the shape an incoming host is reduced to before matching.
  -- Empty means the site answers only on its subdomain.
  "custom_domain" varchar(253) NOT NULL DEFAULT '',
  -- "active" and "draft" both answer a visitor; "inactive" looks like the site
  -- never existed. Draft answers on purpose — it is how a site gets looked at
  -- before anybody is told about it.
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  -- Everything the site looks like: title, tagline, logo, favicon, accent
  -- colour, its own menu, footer text, meta description, maintenance switch.
  -- One column because none of it is ever searched or joined on — it is read
  -- whole to draw one site — and a column each would mean a migration every
  -- time a site gains a knob.
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "sites_status_check" CHECK ("status" IN ('active', 'inactive', 'draft')),
  -- The same rule the admin form applies, kept here as well so nothing that
  -- reaches this table by another route can leave an address that cannot
  -- resolve. Length 3 is the shortest label the form accepts; 63 is the
  -- longest a DNS label may be and is already the column's width.
  CONSTRAINT "sites_subdomain_check" CHECK (
    "subdomain" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND length("subdomain") >= 3
  )
);

-- Two sites cannot share a subdomain: it is how a visitor's host is turned
-- back into one site.
CREATE UNIQUE INDEX IF NOT EXISTS "sites_subdomain_key" ON "sites" ("subdomain");

-- The same for a custom domain, but only where there is one — every site
-- without one keeps the empty string, and those must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS "sites_custom_domain_key"
  ON "sites" ("custom_domain")
  WHERE "custom_domain" <> '';

-- The admin list filters by status and orders by when a site was made.
CREATE INDEX IF NOT EXISTS "ix_sites_status" ON "sites" ("status");
CREATE INDEX IF NOT EXISTS "ix_sites_created_at" ON "sites" ("created_at");
