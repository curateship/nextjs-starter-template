-- Extras: clothing, backdrops, props and hair looks (task
-- ai-generation/04-veo-keeps-the-character).
--
-- An extra is a name, one picture and a written description, kept on its own
-- tab of the Actors dashboard and picked for a first frame from the Extras
-- button in the AI clip panel, one of each kind at most. The first frame and
-- the Veo clip made from it are both sent the pictures and the words, so the
-- person's outfit and the place stay the same from shot to shot.
--
-- What deleting removes:
--
--   Deleting an extra deletes this row only. The file stays in Media.
--   A file cannot be deleted from Media while it is an extra's picture
--   (ON DELETE RESTRICT), the same rule as an actor's main picture.
--   Deleting the person deletes their extras (cascade).
--
-- `kind` is one of four words. Never narrow the list: a saved extra of a kind
-- taken off it would stop loading.
CREATE TABLE IF NOT EXISTS "video_extras" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  "name" varchar(200) NOT NULL,
  "prompt" text NOT NULL,
  "image_media_id" varchar(36) NOT NULL REFERENCES "media"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_extras_kind_check"
    CHECK ("kind" IN ('clothing', 'backdrop', 'prop', 'hair'))
);

CREATE INDEX IF NOT EXISTS "ix_video_extras_user_kind_created"
  ON "video_extras" ("user_id", "kind", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_extras_image_media_id"
  ON "video_extras" ("image_media_id");

-- The extras picked in a project's AI clip panel, one extra id per kind, as
-- {"clothing": "<id>", "backdrop": "<id>"}. Kept on the project so a series
-- keeps the same outfit and place until they are changed. An id whose extra
-- was deleted since is passed over when the picks are read.
ALTER TABLE "video_projects"
  ADD COLUMN IF NOT EXISTS "extra_picks" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The extras a first frame was made with, in the order they were sent, as
-- [{"kind": "clothing", "extra_id": "<id>", "media_id": "<id>"}]. The media id
-- is the picture that was sent, so the Veo clip made from the frame sends the
-- same picture even after the extra's picture is changed or the extra is
-- deleted. Frames made before this migration hold an empty list.
ALTER TABLE "video_first_frames"
  ADD COLUMN IF NOT EXISTS "extras" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- What a Veo piece is sent beyond its first frame, written when the shot is
-- asked for from the frame's own record:
--
--   actor_id             the frame's actor. Null on pieces asked for before
--                        this migration, which are sent exactly what they
--                        always were. Deleting the actor deletes the frame and
--                        its pieces anyway.
--   reference_media_ids  the Media ids that went into the reference pictures:
--                        the person board's tiles in order, then the backdrop.
--                        Empty when none were sent, which is every 4 and 6
--                        second piece, because Veo takes reference pictures
--                        on 8 second clips only.
--   extras               the frame's extras, as on video_first_frames.
ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "actor_id" varchar(36) REFERENCES "video_actors"("id") ON DELETE SET NULL;
ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "reference_media_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "extras" jsonb NOT NULL DEFAULT '[]'::jsonb;
