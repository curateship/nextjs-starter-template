-- Where uploaded files are kept, typed into Settings instead of set as
-- environment variables on the server.
--
-- One row, always id 'r2'. The secret access key is stored scrambled, the same
-- way the AI provider keys are; the other four values are plain because none of
-- them opens the bucket on its own.
--
-- Nothing is copied out of the environment here. A deployment that already has
-- the CUSTOM_SHELL_R2_* variables keeps working untouched: the code reads the
-- saved row first and falls back to the environment when the row is empty.

CREATE TABLE IF NOT EXISTS "storage_settings" (
  "id" varchar(20) PRIMARY KEY NOT NULL,
  "account_id" text,
  "access_key_id" text,
  "secret_access_key" text,
  "bucket_name" text,
  "public_url" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
