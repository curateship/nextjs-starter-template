-- Travel features 3, part 5 (Tyler, 5 Nov 2026: "Row of small photos"): a
-- card holds more photos than its one picture. The card's own `photo_url`
-- stays its first photo, the one on the board; these are the rest, in the
-- order shown in the row. Each is one the person uploaded, or an Unsplash
-- photo with its credit, the same rule as the card's picture.
CREATE TABLE IF NOT EXISTS "travel_activity_photos" (
  "id" varchar(36) PRIMARY KEY,
  "activity_id" varchar(36) NOT NULL REFERENCES "travel_activities" ("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "credit" jsonb,
  "position" integer NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_travel_activity_photos_activity" ON "travel_activity_photos" ("activity_id", "position");
