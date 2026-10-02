-- Two search-engine controls that belong to one written page rather than the
-- whole site.
--
-- `hidden_from_search` puts `noindex` in the page's head and drops it from
-- sitemap.xml. It is not a lock: the page still loads for anyone holding the
-- link, which is what a thank-you page or a campaign landing page wants.
-- Hiding a page from people is the visibility setting, and that is a
-- different, older switch.
--
-- `canonical_url` names the address that counts when the same words answer on
-- two addresses. Empty means the page has no opinion, which is how every page
-- that already exists behaves, so nothing in a live site changes on migrate.
-- A value starting with "/" is an address on this same site and is resolved
-- against the domain the visitor used; anything else is a full web address.

ALTER TABLE "written_pages"
  ADD COLUMN IF NOT EXISTS "hidden_from_search" boolean DEFAULT false NOT NULL;

ALTER TABLE "written_pages"
  ADD COLUMN IF NOT EXISTS "canonical_url" varchar(2048) DEFAULT '' NOT NULL;
