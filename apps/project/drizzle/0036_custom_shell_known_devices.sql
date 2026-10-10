-- The browsers an account has signed in from before.
--
-- This exists for one reason: so "somebody signed in from a new device" can be
-- sent once, and never again for that device. Sessions cannot answer that
-- question -- a session row is deleted the moment somebody signs out, so
-- signing out and back in on the same laptop would look brand new every time,
-- and the alert would become the noise nobody reads.
--
-- The label is the readable one the Security tab already shows ("Chrome on
-- macOS"), not the raw browser line. That is deliberately coarse: it means a
-- second Chrome window, a browser update or a new laptop of the same kind do
-- not raise an alert. Under-alerting on a device somebody already owns is a
-- far smaller problem than an alert a week that trains people to ignore it.
CREATE TABLE IF NOT EXISTS "known_devices" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" varchar(120) NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL
);

-- One row per device per account, and the thing that makes the alert fire
-- exactly once: a second sign-in from the same device conflicts here instead of
-- inserting, so there is nothing new to report.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_known_devices_user_label"
  ON "known_devices" ("user_id", "label");
