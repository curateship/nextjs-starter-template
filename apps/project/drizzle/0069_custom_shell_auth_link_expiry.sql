-- The real lifetime of system-email authentication links, saved beside the
-- other email settings. Null keeps the established per-link defaults.
ALTER TABLE "email_settings"
  ADD COLUMN IF NOT EXISTS "auth_link_expiry" jsonb;
