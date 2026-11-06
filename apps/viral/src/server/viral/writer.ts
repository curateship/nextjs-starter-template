import type { z } from "zod"

import { ANTHROPIC_KEY_MISSING_MESSAGE, OPENAI_KEY_MISSING_MESSAGE } from "@/lib/viral/ai-providers"
import { DEFAULT_WRITER, writerById, type Writer, type WriterId } from "@/lib/viral/writers"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { askAnthropicJson } from "@/server/viral/anthropic-json"
import { generateJson, requireGeminiKey } from "@/server/viral/gemini"
import { askOpenAiJson } from "@/server/viral/openai-json"
import { chosenWriter } from "@/server/viral/writer-choice"

/**
 * The one place Viral asks an AI for words (`workspace/docs/ai-analysis.md`,
 * task part 9). Copied from Video's `askWriter` in
 * `apps/video/src/server/video/writer.ts`.
 *
 * Every feature that writes words hands its question here: the four analysis
 * pieces, Same idea's search line, keyword ideas, format scripts and Write a
 * post for Promo. The writer is the one picked on Settings → AI writer, read
 * fresh each call. A picked writer whose key has gone is passed over for the
 * first one with a key, so removing a key never breaks a button. With no key
 * at all, the Gemini message says which key to add.
 *
 * Whoever answers, the call goes on the shell's AI meter under the feature's
 * own name, with the writer's provider and model beside it, so the AI usage
 * page shows Claude's calls under Claude.
 *
 * `writer` names one writer for a call that must not follow the choice:
 * the topic match always asks Gemini Flash.
 */
/** The longest a button that writes words waits, whichever writer is asked. */
const WRITER_TIMEOUT_MS = 60_000

export async function askWriter<T>({
  userId,
  feature,
  metadata,
  prompt,
  schema,
  label,
  writer: forced,
  timeoutMs,
}: {
  userId: string
  /** The meter's name for this call, such as `viral_script`. */
  feature: string
  /** Kept with the meter row; carry `viralProjectSpendMetadata` so the project's spend limit counts it. */
  metadata: Record<string, unknown>
  /** The whole question. It must ask for JSON, because GPT's JSON mode refuses a question that never says so. */
  prompt: string
  /** The answer's shape. An answer that doesn't fit throws "<label> came back in an unexpected shape". */
  schema: z.ZodType<T>
  /** Starts every error, such as "The script", so the screen says which piece went wrong. */
  label: string
  /** One writer for this call, whatever is picked. */
  writer?: WriterId
  /** How long the writer may take, 60 seconds when left out, after which it says "<label> took too long". */
  timeoutMs?: number
}): Promise<T> {
  const writer: Writer = forced ? writerById(forced) : ((await chosenWriter()) ?? DEFAULT_WRITER)
  const call = { userId, provider: writer.provider, model: writer.model, feature, metadata }

  if (writer.provider === "gemini") {
    const apiKey = await requireGeminiKey()
    return runAiCall(call, async () => {
      const answer = await generateJson({
        apiKey,
        model: writer.model,
        parts: [{ text: prompt }],
        schema,
        label,
        timeoutMs: timeoutMs ?? WRITER_TIMEOUT_MS,
      })
      return { result: answer.value, usage: { inputTokens: answer.inputTokens, outputTokens: answer.outputTokens } }
    })
  }

  const apiKey = await requireKey(writer.provider)
  const ask = writer.provider === "openai" ? askOpenAiJson : askAnthropicJson
  return runAiCall(call, async () => {
    const answer = await ask({ apiKey, model: writer.model, prompt, schema, label, timeoutMs: timeoutMs ?? WRITER_TIMEOUT_MS })
    return { result: answer.value, usage: { inputTokens: answer.inputTokens, outputTokens: answer.outputTokens } }
  })
}

async function requireKey(provider: "openai" | "anthropic") {
  const key = await getAiKey(provider)
  if (!key) throw new Error(provider === "openai" ? OPENAI_KEY_MISSING_MESSAGE : ANTHROPIC_KEY_MISSING_MESSAGE)
  return key
}
