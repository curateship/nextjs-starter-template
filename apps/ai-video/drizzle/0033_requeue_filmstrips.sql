-- Existing filmstrip sprites were scaled with a fixed `scale=W:H` computed from
-- a separate ffprobe call. When that probe read a clip's rotation differently
-- than ffmpeg's decoder -- e.g. portrait phone videos whose rotation lives in a
-- display-matrix side-data entry -- the frame was squished into a mismatched
-- (landscape) cell. The generator now fits every frame with
-- `force_original_aspect_ratio` and measures the real cell from the produced
-- sprite, so it can no longer distort. Requeue every video filmstrip once so the
-- already-stored (possibly squished) sprites are rebuilt with the fixed pipeline.
UPDATE "media"
SET "filmstrip_status" = 'queued',
    "filmstrip_attempts" = 0,
    "filmstrip_lease_token" = NULL,
    "filmstrip_lease_expires_at" = NULL,
    "updated_at" = now()
WHERE "file_type" = 'video'
  AND "filmstrip_status" IN ('ready', 'error');
