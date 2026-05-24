CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "key_hash" varchar(64) NOT NULL,
  "attempted_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_login_attempts_key_time" ON "login_attempts" ("key_hash", "attempted_at");
CREATE INDEX IF NOT EXISTS "ix_login_attempts_attempted_at" ON "login_attempts" ("attempted_at");
