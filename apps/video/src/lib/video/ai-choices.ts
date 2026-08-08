import { z } from "zod"

/**
 * Which AI does what.
 *
 * Two decisions, and both are answered once rather than every time: who writes
 * speech down, and who rewrites words. The choice is offered where the work is
 * asked for and saved the moment it is made, so the next window opens on it.
 *
 * Anything not on offer here, or whose key is gone, quietly falls back — a
 * saved choice must never be able to break a button.
 */

/**
 * Writing down what was said.
 *
 * Whisper lines every word up against the sound it was said in; Gemini reads
 * the sound and estimates. That difference is the whole story of whether
 * cutting a word lands where it should, so it is named plainly rather than
 * hidden behind a model number.
 */
export const TRANSCRIBERS = [
  {
    id: "openai",
    label: "Whisper",
    note: "Lines every word up against the sound. Needs an OpenAI key.",
    provider: "openai",
    model: "whisper-1",
  },
  {
    id: "gemini",
    label: "Gemini",
    note: "Quicker and cheaper, but the word times are estimates.",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },
] as const

export type TranscriberId = (typeof TRANSCRIBERS)[number]["id"]

/** Rewriting words — a hook, and whatever else comes later. */
export const WRITERS = [
  {
    id: "gemini",
    label: "Gemini Flash",
    note: "Quick and cheap.",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },
  {
    id: "openai",
    label: "GPT-5 mini",
    note: "A second opinion, in a different voice.",
    provider: "openai",
    model: "gpt-5-mini",
  },
] as const

export type WriterId = (typeof WRITERS)[number]["id"]

export const aiDefaultsSchema = z
  .object({
    transcriber: z.enum(["openai", "gemini"]).optional(),
    writer: z.enum(["gemini", "openai"]).optional(),
  })
  .strict()

export type AiDefaults = z.infer<typeof aiDefaultsSchema>

/** What was saved, ignoring anything that no longer makes sense. */
export function readAiDefaults(value: unknown): AiDefaults {
  const parsed = aiDefaultsSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

/**
 * Who writes speech down, given what has been chosen and which keys exist.
 *
 * Whisper is the better answer and so the first choice when its key is there;
 * without it, Gemini. A saved choice whose key has since been removed is
 * ignored rather than obeyed into an error.
 */
export function pickTranscriber(
  saved: AiDefaults,
  keys: { words: boolean; openai: boolean }
): (typeof TRANSCRIBERS)[number] | null {
  const available = TRANSCRIBERS.filter((one) =>
    one.id === "openai" ? keys.openai : keys.words
  )
  if (!available.length) return null
  return (
    available.find((one) => one.id === saved.transcriber) ??
    available[0]
  )
}

/** The same, for rewriting words. */
export function pickWriter(
  saved: AiDefaults,
  keys: { words: boolean; openai: boolean }
): (typeof WRITERS)[number] | null {
  const available = WRITERS.filter((one) =>
    one.id === "openai" ? keys.openai : keys.words
  )
  if (!available.length) return null
  return available.find((one) => one.id === saved.writer) ?? available[0]
}
