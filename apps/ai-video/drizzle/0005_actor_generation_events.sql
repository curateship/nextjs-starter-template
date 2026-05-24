CREATE TABLE IF NOT EXISTS "actor_generation_events" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_actor_generation_events_user_created" ON "actor_generation_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_actor_generation_events_created_at" ON "actor_generation_events" ("created_at");
