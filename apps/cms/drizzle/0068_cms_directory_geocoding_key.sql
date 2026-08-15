ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "geocoding_api_key_encrypted" varchar(700);
