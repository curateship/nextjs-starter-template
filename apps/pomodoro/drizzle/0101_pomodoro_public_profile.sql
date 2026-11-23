-- The public profile at /u/<handle>: one page about one person, off until
-- they switch it on.
--
-- No new table. pomodoro_profiles already holds the public display name and
-- the streak badge's secret, so it is the profile table and everything here
-- is a column on it.
--
-- Every switch added here is false. A member who has never opened the new
-- card publishes nothing: no handle, no page, and no section on a page that
-- does not answer. The same goes for pomodoro_projects.is_public, which this
-- migration must never turn on for anybody — a project name is often a
-- client's name.

ALTER TABLE "pomodoro_profiles"
  -- The public address. Null until somebody picks one, lowercase always,
  -- because a handle is an address and `/u/Sarah` and `/u/sarah` must not be
  -- two doors to one page.
  ADD COLUMN IF NOT EXISTS "handle" varchar(30),
  -- Whether /u/<handle> answers at all. Off means the page 404s exactly as an
  -- unknown handle does, so nobody can tell a switched-off profile from one
  -- that was never made.
  ADD COLUMN IF NOT EXISTS "profile_public" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "bio" varchar(280),
  -- The person's own social accounts, in the same shape the site-wide footer
  -- setting already stores, so one normalizer reads both.
  ADD COLUMN IF NOT EXISTS "social_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  -- 'scene:<key>' or 'media:<uuid>', the same spelling
  -- user_preferences.selected_background uses. Never a URL anybody typed.
  ADD COLUMN IF NOT EXISTS "banner_ref" varchar(80),
  -- Up to three badge ids, drawn larger above the rest.
  ADD COLUMN IF NOT EXISTS "pinned_badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
  -- One switch per publishable section. The server reads a section only when
  -- its switch is on, so a section that is off never leaves the server.
  ADD COLUMN IF NOT EXISTS "show_figures" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "show_badges" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "show_heatmap" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "show_projects" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "show_focusing_now" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "show_room" boolean DEFAULT false NOT NULL;

-- One handle is one account. Partial, like the streak badge token's index
-- above it, so the many accounts with no handle do not all collide on null.
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_profiles_handle_unique"
  ON "pomodoro_profiles" ("handle")
  WHERE "handle" IS NOT NULL;

-- The database's own last word on the shape. The app checks it first, before
-- the database is ever asked, but a hand-run UPDATE has no app in front of
-- it, and a handle carrying a NUL byte or a slash is a 500 waiting on a
-- public route.
DO $$
BEGIN
  ALTER TABLE "pomodoro_profiles"
    ADD CONSTRAINT "pomodoro_profiles_handle_shape_check"
    CHECK ("handle" IS NULL OR "handle" ~ '^[a-z0-9_-]{3,30}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Whether a project's name and hours may appear on its owner's profile.
-- Default false, and nothing here flips it: ticking one is a person's job.
ALTER TABLE "pomodoro_projects"
  ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;
