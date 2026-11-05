import type { z } from "zod"

import { runAiCall } from "@/server/ai/usage"
import { generateJson, requireGeminiKey } from "@/server/viral/gemini"

/** The model every words call in Viral asks. The same Flash the breakdown watches with. */
export const WRITER_MODEL = "gemini-3.8-flash"

/**
 * Asking Gemini for words: topic match, keyword ideas and the four analysis
 * pieces all hand their question here. Video lets a person choose between
 * Gemini, GPT and Claude for writing; Viral asks Gemini alone, because the
 * breakdown already needs a Gemini key and one key is one thing to set up
 * (`workspace/docs/ai-analysis.md`). Every call goes on the shell's meter
 * under the tool's own feature name.
 */
export async function askWriter<T>({
  userId,
  feature,
  metadata,
  prompt,
  schema,
  label,
}: {
  userId: string
  feature: string
  metadata: Record<string, unknown>
  prompt: string
  schema: z.ZodType<T>
  label: string
}): Promise<T> {
  const apiKey = await requireGeminiKey()
  return runAiCall({ userId, provider: "gemini", model: WRITER_MODEL, feature, metadata }, async () => {
    const answer = await generateJson({ apiKey, model: WRITER_MODEL, parts: [{ text: prompt }], schema, label })
    return {
      result: answer.value,
      usage: { inputTokens: answer.inputTokens, outputTokens: answer.outputTokens },
    }
  })
}
