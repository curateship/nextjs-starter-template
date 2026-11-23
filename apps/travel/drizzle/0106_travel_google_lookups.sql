-- Travel features 4, part 4 (Tyler, 6 Nov 2026: "100 a day"): Google bills
-- every lookup and anyone can sign up, so each person gets 100 Google lookups
-- a day. One row per person per day (UTC) holds how many they used, and the
-- Google use tab in Settings → App settings adds them up.
CREATE TABLE IF NOT EXISTS "travel_google_lookups" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "lookups" integer NOT NULL,
  PRIMARY KEY ("user_id", "day")
);

CREATE INDEX IF NOT EXISTS "ix_travel_google_lookups_day" ON "travel_google_lookups" ("day");
