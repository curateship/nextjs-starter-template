-- Private events: a page for anyone with the link, left out of every list.
--
-- 'public' is every event written so far and every new one. A 'private'
-- event's page still opens from its address, but the Events page, the month,
-- search, the search box, the sitemap, the feed and the calendar subscription
-- all leave it out, and its page asks search engines not to list it. It is not
-- a password: anyone with the link can read it.
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "visibility" varchar(20) NOT NULL DEFAULT 'public';

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_visibility_check";
ALTER TABLE "events" ADD CONSTRAINT "events_visibility_check"
  CHECK ("visibility" IN ('public', 'private'));
