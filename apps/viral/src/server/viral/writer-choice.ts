import { eq } from "drizzle-orm"

import { DEFAULT_WRITER, pickWriter, type AiKeysSaved, type Writer, type WriterId } from "@/lib/viral/writers"
import { now } from "@/server/auth/security"
import { getAiKey } from "@/server/ai/keys"
import { db } from "@/server/db"
import { viralSettings } from "@/server/viral/schema"

/**
 * The writer picked on Settings → AI writer (`workspace/docs/ai-analysis.md`).
 * One choice for the whole app, kept on Viral's one settings row, because the
 * keys it needs are the app's own keys in Settings → AI. SERVER ONLY.
 *
 * Kept apart from `writer.ts` so the price lines can read it while tests
 * stand a fake writer in for `writer.ts`.
 */

const SETTINGS_ROW_ID = "viral"

/** What was picked, or null for nothing picked (Gemini Flash). */
export async function getSavedWriter(): Promise<WriterId | null> {
  const [row] = await db.select({ writer: viralSettings.writer }).from(viralSettings).where(eq(viralSettings.id, SETTINGS_ROW_ID)).limit(1)
  return row?.writer ?? null
}

export async function saveWriter(writer: WriterId): Promise<void> {
  const at = now()
  await db
    .insert(viralSettings)
    .values({ id: SETTINGS_ROW_ID, writer, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({ target: viralSettings.id, set: { writer, updatedAt: at } })
}

/**
 * Which writers' providers have a key saved right now. Asked fresh every
 * time, so a key removed in Settings → AI stops being used on the next press.
 */
export async function getAiKeysSaved(): Promise<AiKeysSaved> {
  const [gemini, openai, anthropic] = await Promise.all([getAiKey("gemini"), getAiKey("openai"), getAiKey("anthropic")])
  return { gemini: !!gemini, openai: !!openai, anthropic: !!anthropic }
}

/** Who will write the next words: the picked writer, or the first with a key when its key is gone. */
export async function chosenWriter(): Promise<Writer | null> {
  const [saved, keys] = await Promise.all([getSavedWriter(), getAiKeysSaved()])
  return pickWriter(saved, keys)
}

/**
 * The writer a price line names: who will write, or Gemini Flash when no key
 * is saved, since pressing then asks for the Gemini key.
 */
export async function writerForPrices(): Promise<Writer> {
  return (await chosenWriter()) ?? DEFAULT_WRITER
}
