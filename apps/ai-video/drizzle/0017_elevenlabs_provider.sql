-- Allow ElevenLabs as an API-key provider (AI voice generation).
-- Migration 0014 created the table with an INLINE CHECK, which Postgres
-- auto-named "llm_api_keys_provider_check" (the Drizzle schema's intended name
-- "llm_provider_valid" was never actually applied). Drop whichever name exists,
-- then re-add the widened constraint under the canonical "llm_provider_valid"
-- name so the DB matches schema.ts going forward.
ALTER TABLE "llm_api_keys" DROP CONSTRAINT IF EXISTS "llm_api_keys_provider_check";
ALTER TABLE "llm_api_keys" DROP CONSTRAINT IF EXISTS "llm_provider_valid";
ALTER TABLE "llm_api_keys" ADD CONSTRAINT "llm_provider_valid"
  CHECK ("provider" IN ('openai', 'claude', 'gemini', 'elevenlabs'));
