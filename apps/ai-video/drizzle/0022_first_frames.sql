CREATE TABLE IF NOT EXISTS "first_frames" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_id" varchar(36) NOT NULL REFERENCES "actors"("id") ON DELETE CASCADE,
  "generated_media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "reference_media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "reference_source" varchar(20) NOT NULL,
  "name" varchar(255) NOT NULL,
  "prompt" text NOT NULL,
  "model" varchar(100) NOT NULL,
  "aspect_ratio" varchar(10) NOT NULL,
  "tags" jsonb NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "first_frames_reference_source_check" CHECK ("reference_source" in ('actor', 'media')),
  CONSTRAINT "first_frames_aspect_ratio_check" CHECK ("aspect_ratio" in ('9:16', '16:9', '1:1'))
);

CREATE INDEX IF NOT EXISTS "ix_first_frames_user_id" ON "first_frames" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_first_frames_actor_id" ON "first_frames" ("actor_id");
CREATE INDEX IF NOT EXISTS "ix_first_frames_generated_media_id" ON "first_frames" ("generated_media_id");
CREATE INDEX IF NOT EXISTS "ix_first_frames_reference_media_id" ON "first_frames" ("reference_media_id");
CREATE INDEX IF NOT EXISTS "ix_first_frames_user_pinned_created" ON "first_frames" ("user_id", "pinned", "created_at");

UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN section->>'id' = 'section-platform-settings'
          THEN jsonb_set(
            section,
            '{entries}',
            COALESCE(section->'entries', '[]'::jsonb) || '[{"type":"item","id":"item-first-frame","label":"First Frame","href":"/admin/first-frame","icon":"image","visible":true}]'::jsonb
          )
        ELSE section
      END
    )
    FROM jsonb_array_elements(COALESCE("settings"->'sections', '[]'::jsonb)) AS section
  ),
  true
)
WHERE NOT EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE("settings"->'sections', '[]'::jsonb)) AS section
  CROSS JOIN jsonb_array_elements(COALESCE(section->'entries', '[]'::jsonb)) AS entry
  WHERE entry->>'id' = 'item-first-frame'
);
