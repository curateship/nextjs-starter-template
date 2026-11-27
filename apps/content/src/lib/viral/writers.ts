import { AI_MODEL_PRICES, AI_PROVIDER_NAMES } from "@/lib/ai/ai-models"

/**
 * Which AI writes Viral's words (`workspace/docs/ai-analysis.md`, task part
 * 9). Tyler, 6 Nov 2026: "Once in Settings", used by every project, the way
 * Video picks its writer. Copied from Video's `WRITERS` and `pickWriter` in
 * `apps/video/src/lib/video/ai-choices.ts`, which are Video's own files.
 *
 * Gemini still watches every video for the breakdown, whoever writes.
 * Client-safe: the settings tab draws this list.
 */

export const WRITERS = [
  { id: "gemini", label: "Gemini Flash", provider: "gemini", model: "gemini-3.8-flash" },
  { id: "openai", label: "GPT-5 mini", provider: "openai", model: "gpt-5-mini" },
  { id: "anthropic", label: "Claude Opus 5", provider: "anthropic", model: "claude-opus-5" },
] as const

export type Writer = (typeof WRITERS)[number]
export type WriterId = Writer["id"]

export const WRITER_IDS = WRITERS.map((one) => one.id) as [WriterId, ...WriterId[]]

/** Gemini Flash, the writer with nothing picked. */
export const DEFAULT_WRITER: Writer = WRITERS[0]

/** Which providers have a key saved. Never anything about the keys themselves. */
export type AiKeysSaved = { gemini: boolean; openai: boolean; anthropic: boolean }

/** "an Anthropic key", "a Google Gemini key". */
export function keyPhrase(provider: keyof AiKeysSaved): string {
  const name = AI_PROVIDER_NAMES[provider]
  return `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} key`
}

/** Whether this writer can run with the keys that are saved. */
export function canUseWriter(writer: Pick<Writer, "provider">, keys: AiKeysSaved) {
  return keys[writer.provider]
}

/**
 * Who writes, given what was picked and which keys exist. A picked writer
 * whose key has since been removed is passed over for the first one that has
 * a key, in the order Gemini, GPT, Claude, so removing a key never breaks a
 * button. Null when no writer has a key.
 */
export function pickWriter(saved: WriterId | null, keys: AiKeysSaved): Writer | null {
  const available = WRITERS.filter((one) => canUseWriter(one, keys))
  if (!available.length) return null
  return available.find((one) => one.id === saved) ?? available[0]
}

export function writerById(id: WriterId): Writer {
  return WRITERS.find((one) => one.id === id) ?? DEFAULT_WRITER
}

/**
 * What one call costs at this writer's prices, in dollars, from the tokens it
 * reads and writes (`src/lib/ai/ai-models.ts`). Every price line in Viral
 * that is written by the writer adds its calls up with this, so no feature
 * names a model of its own.
 */
export function writerDollars(writer: Pick<Writer, "model">, inputTokens: number, outputTokens: number): number {
  const price = AI_MODEL_PRICES[writer.model]
  return (inputTokens / 1_000_000) * price.inputPerMillion + (outputTokens / 1_000_000) * price.outputPerMillion
}

/**
 * Dollars as whole cents for a price line, rounded up, never under 1. The
 * cents are trimmed to six places first, so $0.14 is 14 cents and not the 15
 * that 14.000000000000002 would round up to.
 */
export function roundedCents(dollars: number): number {
  return Math.max(1, Math.ceil(Number((dollars * 100).toFixed(6))))
}

/** A price line's two facts: rough cents, and the writer's name. */
export type WriterPrice = { cents: number; writer: string }

/** "about 2 cents with Claude Opus 5", the end of every price line. */
export function writerPriceWords({ cents, writer }: WriterPrice): string {
  return `about ${cents} ${cents === 1 ? "cent" : "cents"} with ${writer}`
}
