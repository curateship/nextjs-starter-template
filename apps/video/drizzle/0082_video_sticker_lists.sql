-- Each person's stickers in the studio's Text panel: their own emoji and
-- pictures from their library, in the order they added them.
--
-- One row per person, written the first time they add or remove a sticker.
-- Somebody with no row sees the eight built-in emoji, so nobody's panel
-- changes when this table appears.
--
-- A picture is kept by its media id only. Deleting the file leaves the id
-- behind in the list, and the server drops it on the next read rather than
-- cascading here, because a jsonb list has no foreign key to cascade through.
CREATE TABLE IF NOT EXISTS "video_sticker_lists" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "stickers" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL
);
