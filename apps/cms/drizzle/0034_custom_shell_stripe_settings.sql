-- The Stripe keys become a setting: a live set and a sandbox set, with a
-- switch saying which one the app charges through. Secret keys and webhook
-- secrets are stored encrypted; the publishable keys are public by design and
-- stored as-is. The old env vars stay as a fallback for the live keys, so an
-- install that never opens the settings page keeps working unchanged.
--
-- One row for the whole app (id is always 'stripe') — billing is app-wide,
-- not per workspace: the webhook receiver has no workspace to ask for.
CREATE TABLE "stripe_settings" (
  "id" varchar(36) PRIMARY KEY,
  "use_sandbox" boolean NOT NULL DEFAULT false,
  "live_secret_key_encrypted" text,
  "live_publishable_key" text,
  "live_webhook_secret_encrypted" text,
  "sandbox_secret_key_encrypted" text,
  "sandbox_publishable_key" text,
  "sandbox_webhook_secret_encrypted" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
