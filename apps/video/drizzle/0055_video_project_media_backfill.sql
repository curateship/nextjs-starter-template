-- Keep files already present in saved work. Joining through media also makes
-- the backfill ownership-safe if an old document contains a stale foreign id.

INSERT INTO "video_project_media" ("project_id", "media_id", "created_at")
SELECT DISTINCT project."id", media."id", now()
FROM "video_projects" project
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(project."timeline"->'tracks', '[]'::jsonb)
) track
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(track->'clips', '[]'::jsonb)
) clip
JOIN "media" media
  ON media."id" = clip->>'mediaId'
  AND media."user_id" = project."user_id"
WHERE clip ? 'mediaId'
ON CONFLICT DO NOTHING;

INSERT INTO "video_carousel_media" ("carousel_id", "media_id", "created_at")
SELECT DISTINCT carousel."id", media."id", now()
FROM "video_carousels" carousel
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(carousel."slides", '[]'::jsonb)
) slide
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(slide->'items', '[]'::jsonb)
) item
JOIN "media" media
  ON media."id" = item->>'mediaId'
  AND media."user_id" = carousel."user_id"
WHERE item ? 'mediaId'
ON CONFLICT DO NOTHING;
