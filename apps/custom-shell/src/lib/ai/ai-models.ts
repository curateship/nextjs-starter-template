/**
 * The one list of AI providers and the models an admin can pick from —
 * shared by the key store (server/ai/keys.ts), the Settings → AI card, and
 * the automation canvas's AI step. A fixed dropdown rather than free text so
 * the cost of every flow stays knowable; add a model here when a new one
 * should be offered. The usage-recording task extends this file with prices.
 */

export const AI_PROVIDERS = [
  "anthropic",
  "openai",
  "gemini",
  "elevenlabs",
] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

/**
 * The ones that can answer a written prompt. Everywhere the app asks for
 * words — the automation canvas's AI step, and anything like it — offers
 * these rather than the whole list, because a voice provider has no answer to
 * give. Keys for all of them still live in the one store.
 */
export const AI_TEXT_PROVIDERS = ["anthropic", "openai", "gemini"] as const
export type AiTextProvider = (typeof AI_TEXT_PROVIDERS)[number]

export const AI_PROVIDER_NAMES: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
  elevenlabs: "ElevenLabs",
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
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  // Voices, not writers: these turn words into speech, and are charged by the
  // character rather than by the token — see `AI_UNIT_PRICES` below.
  elevenlabs: [
    { id: "eleven_multilingual_v2", label: "Multilingual v2" },
    { id: "eleven_turbo_v2_5", label: "Turbo v2.5" },
    { id: "eleven_flash_v2_5", label: "Flash v2.5" },
  ],
}

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5.1",
  gemini: "gemini-2.5-flash",
  elevenlabs: "eleven_multilingual_v2",
}

export function isAiProvider(value: unknown): value is AiProvider {
  return (
    typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value)
  )
}

export function isAiTextProvider(value: unknown): value is AiTextProvider {
  return (
    typeof value === "string" &&
    (AI_TEXT_PROVIDERS as readonly string[]).includes(value)
  )
}

/**
 * What each model costs, in dollars per million tokens, straight off the
 * providers' price pages. THE ONLY PLACE PRICES MAY APPEAR — everything that
 * needs a cost goes through `aiCostCents()` below.
 *
 * Last checked: 2026-08-02 (Anthropic from their published API pricing;
 * OpenAI's worth re-checking against platform.openai.com/pricing). The Gemini
 * rows were added on 2026-08-08 from memory rather than the price page, and
 * should be checked against ai.google.dev/pricing before anyone trusts a bill.
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
  "gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
}

/**
 * Work that is not charged by the word.
 *
 * Reading a script aloud is charged by the character, a picture by the
 * picture, a generated video by the second. None of that has tokens to count,
 * so these models carry a price for one unit of whatever they produce, and the
 * caller says how many units it used. Everything else — the ceiling, the
 * warning at 80 out of 100, the block, the usage screen — is the same meter.
 *
 * `unit` is the plain word for one of them, used when a number needs saying
 * out loud.
 *
 * THESE ARE ESTIMATES, not checked against a price page: ElevenLabs bills a
 * character allowance per plan rather than a flat rate, so what a character
 * really costs depends on the plan the key belongs to. Worth correcting
 * against the real bill once one exists.
 */
export const AI_UNIT_PRICES: Record<
  string,
  { dollarsPerUnit: number; unit: string }
> = {
  // Characters of text read aloud, at roughly $0.15 per 1,000 — the quicker
  // voices about half that.
  eleven_multilingual_v2: { dollarsPerUnit: 0.00015, unit: "character" },
  eleven_turbo_v2_5: { dollarsPerUnit: 0.000075, unit: "character" },
  eleven_flash_v2_5: { dollarsPerUnit: 0.000075, unit: "character" },
}

/** Whether this model is charged per unit made rather than per token. */
export function isUnitPricedModel(model: string): boolean {
  return model in AI_UNIT_PRICES
}

/**
 * What a unit-priced call cost, in whole cents. A model missing from the list
 * costs 0 for the same reason token pricing does: losing the row is worse than
 * losing the price, and the price list is the thing to fix.
 */
export function aiUnitCostCents(model: string, units: number): number {
  const price = AI_UNIT_PRICES[model]
  if (!price || !Number.isFinite(units) || units <= 0) return 0
  return Math.round(units * price.dollarsPerUnit * 100)
}

/**
 * The model the "Test this key" button spends its one tiny call on — each
 * provider's cheapest, because the point is proving the key, not the model.
 */
export const AI_KEY_TEST_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5-mini",
  gemini: "gemini-2.5-flash",
  // Nothing is generated to test an ElevenLabs key — the test only asks who
  // the key belongs to, which costs nothing. The model is named so the row on
  // the meter still says what was being checked.
  elevenlabs: "eleven_flash_v2_5",
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
 * server/ai/usage.ts — keeps the constant importable by the browser: a runtime
 * value re-exported out of a `@/server/*` module drags the database driver
 * into the client bundle and kills hydration app-wide.
 */
export const AI_USAGE_RANGES = ["month", "30d", "90d"] as const
export type AiUsageRange = (typeof AI_USAGE_RANGES)[number]

/**
 * The plan-features key that carries a plan's monthly AI allowance, typed as
 * dollars a month (e.g. `"aiDollars": 20` is $20 of AI use a month).
 */
export const AI_ALLOWANCE_FEATURE_KEY = "aiDollars"

/**
 * A plan's monthly AI allowance in whole cents, or null for no ceiling.
 *
 * Missing, switched off, or junk all mean NO ceiling — never a ceiling of
 * zero, or the day the key is mistyped everybody is locked out of AI. A real
 * 0 is kept as a real ceiling: a plan that may not use AI at all.
 */
export function aiAllowanceCentsFromFeatures(
  features: Record<string, unknown>
): number | null {
  const value = features[AI_ALLOWANCE_FEATURE_KEY]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.round(value * 100)
}
