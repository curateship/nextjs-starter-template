import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { canUseWriter, keyPhrase, pickWriter, WRITER_IDS, writerById, type AiKeysSaved, type WriterId } from "@/lib/viral/writers"
import { viralSays } from "@/lib/viral/viral"
import { adminGet, adminPost } from "@/server/guards"
import { getAiKeysSaved, getSavedWriter, saveWriter } from "@/server/viral/writer-choice"

/**
 * Settings → AI writer (`workspace/docs/ai-analysis.md`, task part 9). Admin
 * only, like every Viral door. The browser learns which providers have a key,
 * never anything about the keys themselves.
 */

export type WriterSettings = {
  /** What was picked, or null for nothing picked (Gemini Flash). */
  saved: WriterId | null
  /** Who writes now: the picked writer, or the first with a key when its key is gone. Null with no key at all. */
  using: WriterId | null
  keys: AiKeysSaved
}

async function readWriterSettings(): Promise<WriterSettings> {
  const [saved, keys] = await Promise.all([getSavedWriter(), getAiKeysSaved()])
  return { saved, using: pickWriter(saved, keys)?.id ?? null, keys }
}

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<WriterSettings> => readWriterSettings())

export function loadWriterSettings() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ writer: z.enum(WRITER_IDS) }))
  .handler(async ({ data }): Promise<WriterSettings> => {
    const writer = writerById(data.writer)
    // A writer with no key would only be passed over on every call, so it is refused here, naming the key.
    if (!canUseWriter(writer, await getAiKeysSaved())) {
      throw viralSays(`${writer.label} needs ${keyPhrase(writer.provider)}. Add one in Settings → AI first.`)
    }
    await saveWriter(writer.id)
    return readWriterSettings()
  })

/** Saves the writer the moment it is picked. */
export function saveWriterFn(writer: WriterId) {
  return saveFn({ data: { writer } })
}
