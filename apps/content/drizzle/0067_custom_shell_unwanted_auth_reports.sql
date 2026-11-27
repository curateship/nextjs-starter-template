-- A person can report one emailed reset or sign-in link as unwanted. The
-- report stays after the spent link is cleaned up, while the raw secret and
-- request address are never stored here.
CREATE TABLE IF NOT EXISTS "auth_security_reports" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_purpose" varchar(20) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "auth_security_reports_purpose_check"
    CHECK ("token_purpose" in ('reset_password', 'login'))
);

CREATE INDEX IF NOT EXISTS "ix_auth_security_reports_user_created"
  ON "auth_security_reports" ("user_id", "created_at");
