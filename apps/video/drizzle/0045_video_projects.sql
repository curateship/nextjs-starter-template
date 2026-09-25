-- Projects: what the studio editor opens, and the brand kit it draws with.
--
-- A project is one timeline. The timeline itself is a single JSON document
-- (`{ tracks, aspect }`, checked against the editor's schema at both ends), so
-- adding a clip field later never means a migration here. Two columns beside it
-- exist only so a list of projects can be drawn without reading every timeline:
-- `aspect` is copied from the timeline on every write by the same code that
-- writes the timeline, never sent separately, so the two cannot drift.
--
-- `version` is what stops two open tabs from quietly overwriting each other:
-- every save sends the version it loaded and only lands if it still matches.
-- The loser is told, and says so on screen, rather than winning silently.

CREATE TABLE IF NOT EXISTS "video_projects" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  -- Copied out of the timeline below on every write; see the note above.
  "aspect" varchar(8) NOT NULL,
  -- The editor timeline: { tracks: [...], aspect }.
  "timeline" jsonb NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  -- The still shown on the projects list. Points at an ordinary library image,
  -- and empties itself rather than dangling if that image is deleted.
  "thumbnail_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_projects_aspect_check"
    CHECK ("aspect" in ('16:9', '9:16', '1:1', '4:3')),
  CONSTRAINT "video_projects_version_check" CHECK ("version" >= 1)
);

CREATE INDEX IF NOT EXISTS "ix_video_projects_user_updated"
  ON "video_projects" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_video_projects_thumbnail_media_id"
  ON "video_projects" ("thumbnail_media_id");

-- The brand kit: the colours, fonts and logo every project in this install
-- draws with. One row, and the check is what makes that true rather than a
-- convention — `id` can only ever be 'default'.
--
-- It is one JSON document on purpose. The shell keeps its own styling settings
-- the same way: a later part of this app that needs, say, a watermark position
-- adds a field to the document and its reader defaults it, with no migration
-- and no column that is null on every existing row.
CREATE TABLE IF NOT EXISTS "video_settings" (
  "id" varchar(20) PRIMARY KEY,
  "brand_kit" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_settings_single_row_check" CHECK ("id" = 'default')
);
