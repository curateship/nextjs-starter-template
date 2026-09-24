CREATE TABLE IF NOT EXISTS "automations" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "graph" jsonb NOT NULL,
  "compiled_config" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "automations_user_name_unique" UNIQUE ("user_id", "name")
);

CREATE INDEX IF NOT EXISTS "ix_automations_user_updated" ON "automations" ("user_id", "updated_at");
