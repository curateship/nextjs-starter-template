-- Shuffle, tags and the admin's defaults (admin task 03, 8 Oct 2026).
--
-- A theme or sound carries tags an admin sets. A choice can now be a whole
-- group as well as one item: `shuffle`, or `tags:rain,nature`. Those are
-- longer than a single `curated:<key>`, so the three columns holding a choice
-- grow; no stored value changes.
ALTER TABLE "pomodoro_catalog_items"
  ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "pomodoro_personal_rooms"
  ALTER COLUMN "sound" TYPE varchar(200),
  ALTER COLUMN "background" TYPE varchar(200);
ALTER TABLE "rooms"
  ALTER COLUMN "sound" TYPE varchar(200),
  ALTER COLUMN "background" TYPE varchar(200);
ALTER TABLE "pomodoro_room_repeats"
  ALTER COLUMN "sound" TYPE varchar(200),
  ALTER COLUMN "background" TYPE varchar(200);

-- The app's own admin settings, one row per setting, checked against a fixed
-- shape on every read and write. A missing row means the code's default.
CREATE TABLE IF NOT EXISTS "pomodoro_settings" (
  "key" varchar(60) PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_by_user_id" varchar(36),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Starter tags for the sixteen built-in items, so the By tag tab has
-- something in it from the first visit. An admin edits them on the Themes and
-- Sounds pages; an item an admin has already tagged is left alone.
UPDATE "pomodoro_catalog_items" AS item
SET "tags" = starter.tags
FROM (VALUES
  ('sound', 'lofi', '["lofi", "music"]'::jsonb),
  ('sound', 'rain', '["rain", "nature"]'::jsonb),
  ('sound', 'cafe', '["cafe", "people"]'::jsonb),
  ('sound', 'brown', '["noise"]'::jsonb),
  ('sound', 'forest', '["nature", "birds"]'::jsonb),
  ('sound', 'ocean', '["nature", "water"]'::jsonb),
  ('sound', 'fire', '["fire", "cozy"]'::jsonb),
  ('sound', 'piano', '["piano", "music"]'::jsonb),
  ('theme', 'lofi', '["lofi", "cozy"]'::jsonb),
  ('theme', 'ambient', '["calm"]'::jsonb),
  ('theme', 'plain', '["calm", "dark"]'::jsonb),
  ('theme', 'stars', '["night", "calm"]'::jsonb),
  ('theme', 'rain', '["rain", "nature"]'::jsonb),
  ('theme', 'forest', '["nature", "night"]'::jsonb),
  ('theme', 'ocean', '["nature", "water"]'::jsonb),
  ('theme', 'fireplace', '["fire", "cozy"]'::jsonb)
) AS starter(kind, key, tags)
WHERE item."kind" = starter.kind
  AND item."key" = starter.key
  AND item."tags" = '[]'::jsonb;

-- Until now silence and "never picked a sound" were both saved as null. From
-- here null means never picked, which gets the admin's default or shuffle, and
-- silence is 'none'. Tyler, 8 Oct 2026: every sound already saved as null stays
-- silent, so nobody who turned sound off hears it come back.
UPDATE "pomodoro_personal_rooms" SET "sound" = 'none' WHERE "sound" IS NULL;
