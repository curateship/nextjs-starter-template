import { z } from "zod"

import type { SpokenWord } from "@/lib/video/voice"
import { OPENAI_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { getAiKey } from "@/server/ai/keys"

/**
 * Writing down speech with Whisper.
 *
 * The reason this exists beside the Gemini path: Whisper lines every word up
 * against the sound it was said in, rather than estimating when each one
 * happened. Cutting a word out only lands where it should if the times are
 * measured, so this is what the word-level work wants whenever its key is
 * there.
 *
 * One call gives back the words with their times; the caller decides what to
 * do with them.
 */

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions"

const answerSchema = z.object({
  text: z.string().optional(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      })
    )
    .optional(),
})

export async function requireOpenAiKey() {
  const key = await getAiKey("openai")
  if (!key) throw new Error(OPENAI_KEY_MISSING_MESSAGE)
  return key
}

export type WhisperResult = {
  words: SpokenWord[]
  /** Everything that was said, as one run of text. */
  text: string
}

/**
 * The words of one piece of sound, with when each was said.
 *
 * `label` starts any error, so the message that reaches the screen says which
 * feature was asking.
 */
export async function transcribeWithWhisper({
  apiKey,
  audio,
  label,
}: {
  apiKey: string
  audio: Uint8Array
  label: string
}): Promise<WhisperResult> {
  const form = new FormData()
  const bytes = new Uint8Array(audio).buffer as ArrayBuffer
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "audio.wav")
  form.append("model", "whisper-1")
  form.append("response_format", "verbose_json")
  // Without this it answers in sentences; the whole point here is words.
  form.append("timestamp_granularities[]", "word")

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  })
  if (!response.ok) {
    const body = await response.text().then(
      (text) => text.slice(0, 500),
      () => ""
    )
    console.error(`Whisper ${label}`, response.status, body)
    throw new Error(`${label} failed (HTTP ${response.status})`)
  }

  const parsed = answerSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error(`${label} came back in an unexpected shape`)

  return {
    text: parsed.data.text?.trim() ?? "",
    words: (parsed.data.words ?? []).map((word) => ({
      text: word.word,
      startMs: Math.round(word.start * 1000),
      endMs: Math.round(word.end * 1000),
    })),
  }
}
