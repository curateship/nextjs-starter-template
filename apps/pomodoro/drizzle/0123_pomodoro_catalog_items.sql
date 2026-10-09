-- Themes and sounds move out of the code into a table an admin can edit
-- (admin task 02, 8 Oct 2026). The sixteen built-in items are copied in with
-- the keys they already had, so every saved `scene:<key>` and `curated:<key>`
-- keeps working, and their files stay where they ship, under public/.
CREATE TABLE IF NOT EXISTS "pomodoro_catalog_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" varchar(10) NOT NULL,
  "key" varchar(40) NOT NULL,
  "label" varchar(60) NOT NULL,
  "hint" varchar(120) NOT NULL DEFAULT '',
  "descriptor" varchar(20) NOT NULL DEFAULT '',
  "locked" boolean NOT NULL DEFAULT false,
  "status" varchar(10) NOT NULL DEFAULT 'draft',
  "position" integer NOT NULL DEFAULT 0,
  "file_url" varchar(500),
  "file_path" varchar(300),
  "picture_url" varchar(500),
  "picture_path" varchar(300),
  "file_status" varchar(12) NOT NULL DEFAULT 'ready',
  "file_error" varchar(300),
  "source_path" varchar(300),
  "source_kind" varchar(10),
  "attempts" integer NOT NULL DEFAULT 0,
  "claimed_at" timestamp with time zone,
  "duration_seconds" integer,
  "volume" integer NOT NULL DEFAULT 100,
  "artist" varchar(120),
  "source_url" varchar(500),
  "licence" varchar(20),
  "licence_note" varchar(300),
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_catalog_items_kind_check" CHECK ("kind" in ('theme', 'sound')),
  CONSTRAINT "pomodoro_catalog_items_status_check" CHECK ("status" in ('draft', 'live')),
  CONSTRAINT "pomodoro_catalog_items_file_status_check" CHECK ("file_status" in ('ready', 'queued', 'processing', 'failed')),
  CONSTRAINT "pomodoro_catalog_items_volume_check" CHECK ("volume" between 10 and 100),
  CONSTRAINT "pomodoro_catalog_items_licence_check" CHECK ("licence" is null or "licence" in ('bought', 'free', 'ai', 'own', 'other')),
  CONSTRAINT "pomodoro_catalog_items_kind_key_unique" UNIQUE ("kind", "key")
);

CREATE INDEX IF NOT EXISTS "pomodoro_catalog_items_kind_position_idx"
  ON "pomodoro_catalog_items" ("kind", "position");
CREATE INDEX IF NOT EXISTS "pomodoro_catalog_items_file_queue_idx"
  ON "pomodoro_catalog_items" ("created_at")
  WHERE "file_status" in ('queued', 'processing');

-- Published long ago, so the built-in items never carry the NEW label.
INSERT INTO "pomodoro_catalog_items"
  ("kind", "key", "label", "hint", "descriptor", "locked", "status", "position", "file_url", "picture_url", "published_at")
VALUES
  ('theme', 'lofi', 'Lofi girl', '', 'video', false, 'live', 0, '/backgrounds/uploads-265816_small.mp4', '/backgrounds/thumbs-lofi_girl.png', '2026-01-01T00:00:00Z'),
  ('theme', 'ambient', 'Ambient glow', '', 'animated', false, 'live', 1, null, '/backgrounds/thumbs-ambient.png', '2026-01-01T00:00:00Z'),
  ('theme', 'plain', 'Plain dark', '', 'static', false, 'live', 2, null, '/backgrounds/thumbs-plain.png', '2026-01-01T00:00:00Z'),
  ('theme', 'stars', 'Starry night', '', 'animated', false, 'live', 3, null, '/backgrounds/thumbs-stars.png', '2026-01-01T00:00:00Z'),
  ('theme', 'rain', 'Rainy window', '', 'video', true, 'live', 4, null, '/backgrounds/thumbs-rain.png', '2026-01-01T00:00:00Z'),
  ('theme', 'forest', 'Night forest', '', 'video', true, 'live', 5, null, '/backgrounds/thumbs-forest.png', '2026-01-01T00:00:00Z'),
  ('theme', 'ocean', 'Ocean waves', '', 'video', true, 'live', 6, null, '/backgrounds/thumbs-ocean.png', '2026-01-01T00:00:00Z'),
  ('theme', 'fireplace', 'Fireplace', '', 'video', true, 'live', 7, null, '/backgrounds/thumbs-fireplace.png', '2026-01-01T00:00:00Z'),
  ('sound', 'lofi', 'Lofi beats', 'Mellow hip-hop loops', 'music', false, 'live', 0, '/sounds/audio-lofi.mp3', '/sounds/sounds-lofi.png', '2026-01-01T00:00:00Z'),
  ('sound', 'rain', 'Rain', 'Steady rain on a window', 'ambient', false, 'live', 1, '/sounds/audio-rain.mp3', '/sounds/sounds-rain.png', '2026-01-01T00:00:00Z'),
  ('sound', 'cafe', 'Café ambience', 'Low chatter and cups', 'ambient', false, 'live', 2, '/sounds/audio-cafe.mp3', '/sounds/sounds-cafe.png', '2026-01-01T00:00:00Z'),
  ('sound', 'brown', 'Brown noise', 'Deep steady noise', 'noise', false, 'live', 3, '/sounds/audio-brown.mp3', '/sounds/sounds-brown.png', '2026-01-01T00:00:00Z'),
  ('sound', 'forest', 'Forest birds', 'Birdsong and soft wind', 'ambient', true, 'live', 4, '/sounds/audio-forest.mp3', '/sounds/sounds-forest.png', '2026-01-01T00:00:00Z'),
  ('sound', 'ocean', 'Ocean waves', 'Slow rolling waves', 'ambient', true, 'live', 5, '/sounds/audio-ocean.mp3', '/sounds/sounds-ocean.png', '2026-01-01T00:00:00Z'),
  ('sound', 'fire', 'Fireplace', 'Crackling logs', 'ambient', true, 'live', 6, '/sounds/audio-fire.mp3', '/sounds/sounds-fire.png', '2026-01-01T00:00:00Z'),
  ('sound', 'piano', 'Soft piano', 'Gentle keys and air', 'music', true, 'live', 7, '/sounds/audio-piano.mp3', '/sounds/sounds-piano.png', '2026-01-01T00:00:00Z')
ON CONFLICT ("kind", "key") DO NOTHING;
