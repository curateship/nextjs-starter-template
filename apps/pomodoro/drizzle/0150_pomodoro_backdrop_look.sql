-- The scene behind the timer: a dim slider and a slow drift on picture
-- backgrounds (uploads-and-sharing task 08, Parts 2 and 4, 10 Oct 2026).
--
-- The dim is how dark the layer between the scene and the page is, 0 to 70
-- out of 100. It starts at 0, so nothing changes until a member moves it.
-- The drift is a slow zoom on a picture the member uploaded; a film never
-- drifts. A guest keeps both in the browser instead.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "backdrop_dim" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "backdrop_drift" boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE "user_preferences" ADD CONSTRAINT "preferences_backdrop_dim_check"
    CHECK ("backdrop_dim" BETWEEN 0 AND 70);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
