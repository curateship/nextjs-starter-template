ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "front_page_mode" varchar(20) NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS "front_page_count" integer NOT NULL DEFAULT 8;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_settings_front_page_mode_check'
  ) THEN
    ALTER TABLE "directory_settings"
      ADD CONSTRAINT "directory_settings_front_page_mode_check"
      CHECK ("front_page_mode" IN ('off', 'newest', 'featured'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_settings_front_page_count_check'
  ) THEN
    ALTER TABLE "directory_settings"
      ADD CONSTRAINT "directory_settings_front_page_count_check"
      CHECK ("front_page_count" BETWEEN 1 AND 12);
  END IF;
END $$;
