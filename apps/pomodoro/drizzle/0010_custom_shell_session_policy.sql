-- Session policy: sessions now remember when they last made a request, so the
-- idle limit in Settings -> Security can sign out people who walked away.
--
-- Existing sessions start their idle clock at the moment this runs. Nothing
-- older is known about them, and starting at "now" means turning the feature
-- on cannot sign anyone out the instant it arrives.
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone NOT NULL DEFAULT now();
