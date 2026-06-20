CREATE TABLE IF NOT EXISTS "instagram_carousels" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "format" varchar(20) DEFAULT '4:5' NOT NULL,
  "source_text" text DEFAULT '' NOT NULL,
  "caption" text DEFAULT '' NOT NULL,
  "slides" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "instagram_carousels_format_check"
    CHECK ("format" IN ('4:5', '1:1', '9:16'))
);

CREATE INDEX IF NOT EXISTS "ix_instagram_carousels_user_id"
  ON "instagram_carousels" ("user_id");

CREATE INDEX IF NOT EXISTS "ix_instagram_carousels_user_updated"
  ON "instagram_carousels" ("user_id", "updated_at");
