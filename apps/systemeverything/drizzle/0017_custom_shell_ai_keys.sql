-- API keys for AI providers (Anthropic, OpenAI): one row per provider, shared
-- by the whole app and managed on Settings -> AI.
--
-- "api_key" never holds the key as typed. The server encrypts it first
-- (AES-256-GCM, keyed by CUSTOM_SHELL_SECRET_ENCRYPTION_KEY) and stores
-- base64(iv).base64(tag).base64(ciphertext), so a stolen database backup does
-- not contain a usable key. If that env secret is ever lost the rows become
-- unreadable on purpose; recovery is pasting the keys again, not decryption.
CREATE TABLE IF NOT EXISTS "ai_provider_keys" (
  "provider" varchar(20) PRIMARY KEY,
  "api_key" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
