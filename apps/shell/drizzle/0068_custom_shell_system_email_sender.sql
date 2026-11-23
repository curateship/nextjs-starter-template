-- Each workspace can choose the verified address used by its sign-in, reset,
-- and security emails. Empty keeps the deployment's environment fallback.
ALTER TABLE "email_settings"
  ADD COLUMN IF NOT EXISTS "system_from_email" varchar(255);
