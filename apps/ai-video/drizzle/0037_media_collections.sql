-- Media collections: named manual groupings of library media ("B-roll — gym",
-- "Logos"). A media item can sit in any number of collections, so membership
-- lives in a join table. Both foreign keys cascade, which means deleting a
-- collection detaches its items without touching the media, and deleting media
-- drops its memberships.

CREATE TABLE IF NOT EXISTS "media_collections" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_media_collections_user_id"
  ON "media_collections" ("user_id");

-- Case-insensitive, so one library cannot hold both "Logos" and "logos".
CREATE UNIQUE INDEX IF NOT EXISTS "ux_media_collections_user_name"
  ON "media_collections" ("user_id", lower("name"));

CREATE TABLE IF NOT EXISTS "media_collection_items" (
  "collection_id" varchar(36) NOT NULL
    REFERENCES "media_collections"("id") ON DELETE CASCADE,
  "media_id" varchar(36) NOT NULL
    REFERENCES "media"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("collection_id", "media_id")
);

-- Reading a media item's collections, and the "uncollected" filter, both look
-- up by media id.
CREATE INDEX IF NOT EXISTS "ix_media_collection_items_media_id"
  ON "media_collection_items" ("media_id");
