-- The shape of the sound in each audio and video file, so a sound clip on the
-- timeline can draw where the words and the beats are instead of a made-up
-- pattern. Nothing reads this table until the timeline asks, so a workspace
-- that never uploads sound behaves exactly as it did.
--
-- It is the third background work queue beside `video_media_proxies` and
-- `video_media_filmstrips`, and it works the same way: a `queued` row is
-- waiting, a `generating` row is claimed under a lease that expires, and a
-- worker that dies mid-job leaves a lease to reclaim rather than a stuck row.
--
-- The points are kept in the row, not in a stored file. One byte per point at
-- 25 points a second, capped at 30,000 points, is at most about 40KB of base64.
-- That is small enough to read in the same query that checks the status, and
-- it means there is no storage key to write, serve, or clean up. Deleting the
-- media row takes the points with it.
CREATE TABLE IF NOT EXISTS "video_media_waveforms" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  -- queued -> generating -> ready, or error once the attempts are spent.
  "status" varchar(20) NOT NULL,
  -- Names the recipe that built the points, so a later recipe can tell old
  -- rows from new ones. Only one recipe exists today.
  "profile" varchar(40) NOT NULL,
  -- Base64 of one byte per point, 0 to 255, where 255 is the loudest moment in
  -- that file. An empty string means the file has no sound track.
  "peaks" text,
  "point_count" integer,
  -- How long the sound runs, which the points are spread evenly across.
  "duration_ms" integer,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_media_waveforms_status_check"
    CHECK ("status" in ('queued', 'generating', 'ready', 'error')),
  CONSTRAINT "video_media_waveforms_profile_check"
    CHECK ("profile" = 'u8-peaks-25ps-v1'),
  -- A "ready" row the timeline cannot draw would be a lie. A file with no
  -- sound track is ready with zero points, so the timeline stops asking. The
  -- coalesce is there because a check on an empty value passes in SQL.
  CONSTRAINT "video_media_waveforms_ready_check"
    CHECK ("status" <> 'ready' OR ("peaks" IS NOT NULL
      AND coalesce("point_count", -1) >= 0
      AND ("point_count" = 0 OR coalesce("duration_ms", 0) > 0))),
  CONSTRAINT "video_media_waveforms_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX IF NOT EXISTS "ix_video_media_waveforms_status_created"
  ON "video_media_waveforms" ("status", "created_at");
