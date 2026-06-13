-- App-wide LLM provider API keys, managed from Settings → AI Providers.
-- One row per provider (shared across the workspace, like the env-var fallback
-- it augments). Keys are server-only; the UI only ever sees a masked tail.
CREATE TABLE IF NOT EXISTS llm_api_keys (
  provider varchar(20) PRIMARY KEY CHECK (provider IN ('openai', 'claude', 'gemini')),
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
