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
