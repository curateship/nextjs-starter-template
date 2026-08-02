/**
 * The one list of AI providers and the models an admin can pick from —
 * shared by the key store (server/ai-keys.ts), the Settings → AI card, and
 * the automation canvas's AI step. A fixed dropdown rather than free text so
 * the cost of every flow stays knowable; add a model here when a new one
 * should be offered. The usage-recording task extends this file with prices.
 */

export const AI_PROVIDERS = ["anthropic", "openai"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const AI_PROVIDER_NAMES: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
}

export type AiModelOption = {
  id: string
  label: string
}

export const AI_MODEL_OPTIONS: Record<AiProvider, readonly AiModelOption[]> = {
  anthropic: [
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-5.1", label: "GPT-5.1" },
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
  ],
}

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5.1",
}

export function isAiProvider(value: unknown): value is AiProvider {
  return (
    typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value)
  )
}

/**
 * What each model costs, in dollars per million tokens, straight off the
 * providers' price pages. THE ONLY PLACE PRICES MAY APPEAR — everything that
 * needs a cost goes through `aiCostCents()` below.
 *
 * Last checked: 2026-08-02 (Anthropic from their published API pricing;
 * OpenAI's worth re-checking against platform.openai.com/pricing).
 */
export const AI_MODEL_PRICES: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  "claude-opus-5": { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-sonnet-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
  "gpt-5.1": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2 },
}

/**
 * The model the "Test this key" button spends its one tiny call on — each
 * provider's cheapest, because the point is proving the key, not the model.
 */
export const AI_KEY_TEST_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5-mini",
}

/**
 * What a call cost, in whole cents, so thousands of rows add up without
 * drifting. A model missing from the price list costs 0 rather than losing
 * the row — the tokens still get recorded and the price list gets fixed.
 */
export function aiCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = AI_MODEL_PRICES[model]
  if (!price) return 0
  const dollars =
    (inputTokens * price.inputPerMillion +
      outputTokens * price.outputPerMillion) /
    1_000_000
  return Math.round(dollars * 100)
}

/**
 * The windows the AI usage dashboard can show. Living here — not in
 * server/ai-usage.ts — keeps the constant importable by the browser: a runtime
 * value re-exported out of a `@/server/*` module drags the database driver
 * into the client bundle and kills hydration app-wide.
 */
export const AI_USAGE_RANGES = ["month", "30d", "90d"] as const
export type AiUsageRange = (typeof AI_USAGE_RANGES)[number]
