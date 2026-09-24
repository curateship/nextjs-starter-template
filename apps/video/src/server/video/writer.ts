import { z } from "zod"

import { ANTHROPIC_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { pickWriter } from "@/lib/video/ai-choices"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { askAnthropicJson } from "@/server/video/anthropic-json"
import { generateJson, requireGeminiKey } from "@/server/video/gemini"
import { askOpenAiJson } from "@/server/video/openai-json"
import { getAiDefaults } from "@/server/video/settings"
import { requireOpenAiKey } from "@/server/video/whisper"

/**
 * Asking whichever AI is chosen for rewriting words.
 *
 * Every tool that writes words (the hook rewriter, the caption translator, the
 * carousel polisher) hands its question here. The choice is read fresh each
 * time, and a choice whose key has gone falls back to one that has a key, so
 * removing a key in Settings never breaks a button. Whoever answers, the call
 * goes on the one meter under the tool's own feature name.
 */
export async function askWriter<T>({
  userId,
  feature,
  metadata,
  prompt,
  schema,
  label,
  timeoutMs,
}: {
  userId: string
  feature: string
  metadata: Record<string, unknown>
  prompt: string
  schema: z.ZodType<T>
  label: string
  /** How long OpenAI or Claude may take. Gemini keeps its own limit. */
  timeoutMs?: number
}): Promise<T> {
  const writer = pickWriter(await getAiDefaults(), await getAiKeysSaved())

  // No writer at all means no key for any of them, and Gemini is the one to
  // ask for: it is the one every words tool can use.
  if (!writer || writer.provider === "gemini") {
    const apiKey = await requireGeminiKey()
    const model = writer?.model ?? "gemini-2.5-flash"
    return runAiCall(
      { userId, provider: "gemini", model, feature, metadata },
      async () => {
        const answer = await generateJson({
          apiKey,
          model,
          parts: [{ text: prompt }],
          schema,
          label,
        })
        return {
          result: answer.value,
          usage: {
            inputTokens: answer.inputTokens,
            outputTokens: answer.outputTokens,
          },
        }
      }
    )
  }

  const apiKey =
    writer.provider === "openai"
      ? await requireOpenAiKey()
      : await requireAnthropicKey()
  const ask = writer.provider === "openai" ? askOpenAiJson : askAnthropicJson
  return runAiCall(
    {
      userId,
      provider: writer.provider,
      model: writer.model,
      feature,
      metadata,
    },
    async () => {
      const answer = await ask({
        apiKey,
        model: writer.model,
        prompt,
        schema,
        label,
        timeoutMs,
      })
      return {
        result: answer.value,
        usage: {
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
        },
      }
    }
  )
}

async function requireAnthropicKey() {
  const key = await getAiKey("anthropic")
  if (!key) throw new Error(ANTHROPIC_KEY_MISSING_MESSAGE)
  return key
}
