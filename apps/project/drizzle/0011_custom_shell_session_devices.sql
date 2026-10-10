-- Device list: a session now remembers the browser it was started from and the
-- address it came from, so Account -> Security can show a person where they are
-- signed in and let them end one of those sessions on its own.
--
-- Both are nullable on purpose. Sessions that already exist have no answer, and
-- a browser is free to send no user agent at all; the list says "Unknown
-- device" rather than pretending.
--
-- The address is kept whole rather than masked. It is only ever shown to the
-- person who signed in from it, recognising it is the entire point of the list,
-- and it is thrown away with the session row itself -- there is no separate
-- store and nothing outlives the session.
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "user_agent" text,
  -- 45 characters is the longest an IPv6 address can be written out.
  ADD COLUMN IF NOT EXISTS "ip_address" varchar(45);
