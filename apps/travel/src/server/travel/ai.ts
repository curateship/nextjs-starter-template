import { AI_TEXT_PROVIDERS, DEFAULT_AI_MODEL, type AiTextProvider } from "@/lib/ai/ai-models"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { getAiKey } from "@/server/ai/keys"
import { isAiLimitError, runAiCall, type AiCallUsage } from "@/server/ai/usage"

/**
 * Travel's AI calls: reading a booking email (task part 44) and drafting a
 * trip's first plan (Travel features part 7). Both ask one question and want
 * JSON back, through the shell's metered call.
 */

/** Asks the AI one question and returns its words. Swapped out in tests. */
export type AskAi = (system: string, prompt: string) => Promise<string>

function tokens(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

/**
 * One prompt to whichever text provider has a key. The same three HTTP calls
 * the shell's CRM draft makes; that one isn't exported, and a shell file is
 * never edited from an app.
 */
async function generate(
  provider: AiTextProvider,
  model: string,
  key: string,
  system: string,
  prompt: string,
  { maxTokens, failed }: { maxTokens: number; failed: string }
): Promise<{ text: string; usage: AiCallUsage }> {
  const signal = AbortSignal.timeout(60_000)

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal,
    })
    const payload = (await response.json().catch(() => null)) as {
      content?: { type?: string; text?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    } | null
    if (!response.ok || !payload) throw new Error(failed)
    return {
      text: (payload.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join(""),
      usage: { inputTokens: tokens(payload.usage?.input_tokens), outputTokens: tokens(payload.usage?.output_tokens) },
    }
  }

  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal,
    })
    const payload = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    } | null
    if (!response.ok || !payload) throw new Error(failed)
    return {
      text: payload.choices?.[0]?.message?.content ?? "",
      usage: { inputTokens: tokens(payload.usage?.prompt_tokens), outputTokens: tokens(payload.usage?.completion_tokens) },
    }
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    }),
    signal,
  })
  const payload = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  } | null
  if (!response.ok || !payload) throw new Error(failed)
  return {
    text: (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join(""),
    usage: {
      inputTokens: tokens(payload.usageMetadata?.promptTokenCount),
      outputTokens: tokens(payload.usageMetadata?.candidatesTokenCount),
    },
  }
}

/**
 * The real AI, through the shell's metered call: the person's monthly
 * allowance is checked first and the cost is written down after. The first
 * text provider with a key does the work, as with every other AI feature.
 * `feature` names the call in the AI usage list, and `failed` is what the
 * person is told when the provider doesn't answer.
 */
export function meteredAi(
  userId: string,
  { feature, maxTokens, failed }: { feature: string; maxTokens: number; failed: string }
): AskAi {
  return async (system, prompt) => {
    let provider: AiTextProvider | null = null
    let key: string | null = null
    for (const candidate of AI_TEXT_PROVIDERS) {
      try {
        key = await getAiKey(candidate)
      } catch (error) {
        // Saved keys can't be read without the server's encryption key, which
        // means no AI is set up here, the same as having no key at all.
        if (error instanceof Error && error.message.includes("ENCRYPTION_NOT_CONFIGURED")) throw new Error(TRAVEL_ERRORS.aiOff)
        throw error
      }
      if (key) {
        provider = candidate
        break
      }
    }
    if (!provider || !key) throw new Error(TRAVEL_ERRORS.aiOff)
    const model = DEFAULT_AI_MODEL[provider]
    const found = { provider, key }
    try {
      return await runAiCall({ userId, provider, model, feature }, async () => {
        const generated = await generate(found.provider, model, found.key, system, prompt, { maxTokens, failed })
        return { result: generated.text, usage: generated.usage }
      })
    } catch (error) {
      if (isAiLimitError(error)) throw new Error(TRAVEL_ERRORS.aiLimit)
      if (error instanceof Error && error.message === failed) throw error
      // A timeout or a dropped connection says the same thing to the person.
      throw new Error(failed)
    }
  }
}
