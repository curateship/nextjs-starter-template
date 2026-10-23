import {
  AI_PROVIDER_NAMES,
  type AiTextProvider,
} from "@/lib/ai/ai-models"
import { getAiKey } from "@/server/ai/keys"
import {
  isAiLimitError,
  runAiCall,
  type AiCallUsage,
} from "@/server/ai/usage"

/**
 * One question to a writing AI whose answer must be a JSON object.
 *
 * Plain `fetch`, like the key test in `server/ai/keys.ts`, because the step
 * lets an admin pick any of the three providers and the app carries no
 * provider package. Goes through `runAiCall`, so every call is on the usage
 * dashboard and counts against the flow author's monthly AI allowance.
 *
 * Throws a sentence an admin can act on. The run history shows it as it is.
 *
 * An answer that came back cut off or declined is still judged after
 * `runAiCall` has recorded it, because the provider charged for those tokens
 * and the usage page has to show what was spent.
 */

const TIMEOUT_MS = 180_000
const MAX_OUTPUT_TOKENS = 16_000

type Question = {
  provider: AiTextProvider
  model: string
  system: string
  prompt: string
  /** Whose allowance pays, or null when nobody owns the flow any more. */
  userId: string | null
  feature: string
  metadata?: Record<string, unknown>
}

type Answer = {
  text: string
  usage: AiCallUsage
  /** Why the answer cannot be used though it was paid for, or null. */
  problem: string | null
}

export async function askAiForJson(question: Question): Promise<unknown> {
  const name = AI_PROVIDER_NAMES[question.provider]
  const key = await getAiKey(question.provider)
  if (!key) {
    throw new Error(
      `No ${name} key is saved, so the AI could not read the page. Add one in Settings → AI.`
    )
  }

  let answer: Answer
  try {
    answer = await runAiCall<Answer>(
      {
        userId: question.userId,
        provider: question.provider,
        model: question.model,
        feature: question.feature,
        metadata: question.metadata,
      },
      async () => {
        const result = await ASK[question.provider](key, name, question)
        return { result, usage: result.usage }
      }
    )
  } catch (error) {
    if (isAiLimitError(error)) {
      throw new Error(
        "The person who made this flow has used this month's AI allowance, so the page was not read."
      )
    }
    throw error
  }
  if (answer.problem) throw new Error(answer.problem)
  return parseJsonAnswer(answer.text, name)
}

/** The JSON inside an answer, allowing for a ```json fence around it. */
function parseJsonAnswer(text: string, name: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed)
  } catch {
    throw new Error(`${name} answered with something that was not a list of events.`)
  }
}

const ASK: Record<
  AiTextProvider,
  (key: string, name: string, question: Question) => Promise<Answer>
> = {
  anthropic: async (key, name, { model, system, prompt }) => {
    // Haiku 4.5 takes no effort setting. The fallback, which asks the API to
    // answer on another Claude model rather than decline, is for Opus 5.
    const effort = !model.startsWith("claude-haiku")
    const fallback = model.startsWith("claude-opus-5")
    const payload = await post(
      name,
      "https://api.anthropic.com/v1/messages",
      {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        ...(fallback
          ? { "anthropic-beta": "server-side-fallback-2026-07-01" }
          : {}),
      },
      {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: "user", content: prompt }],
        // Reading dates off a page is careful work, not deep thought.
        ...(effort ? { output_config: { effort: "medium" } } : {}),
        ...(fallback ? { fallbacks: "default" } : {}),
      }
    )
    const content = Array.isArray(payload.content) ? payload.content : []
    const usage = record(payload.usage)
    return {
      text: content
        .map((block) => record(block))
        .filter((block) => block.type === "text")
        .map((block) => String(block.text ?? ""))
        .join(""),
      usage: {
        inputTokens: count(usage.input_tokens),
        outputTokens: count(usage.output_tokens),
      },
      problem:
        payload.stop_reason === "refusal"
          ? `${name} declined to read this page.`
          : payload.stop_reason === "max_tokens"
            ? cutOff(name)
            : null,
    }
  },

  openai: async (key, name, { model, system, prompt }) => {
    const payload = await post(
      name,
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${key}` },
      {
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }
    )
    const choice = record(Array.isArray(payload.choices) ? payload.choices[0] : null)
    const usage = record(payload.usage)
    return {
      text: String(record(choice.message).content ?? ""),
      usage: {
        inputTokens: count(usage.prompt_tokens),
        outputTokens: count(usage.completion_tokens),
      },
      problem: choice.finish_reason === "length" ? cutOff(name) : null,
    }
  },

  gemini: async (key, name, { model, system, prompt }) => {
    const payload = await post(
      name,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": key },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }
    )
    const candidate = record(
      Array.isArray(payload.candidates) ? payload.candidates[0] : null
    )
    const parts = record(candidate.content).parts
    const usage = record(payload.usageMetadata)
    return {
      text: (Array.isArray(parts) ? parts : [])
        .map((part) => String(record(part).text ?? ""))
        .join(""),
      usage: {
        inputTokens: count(usage.promptTokenCount),
        outputTokens: count(usage.candidatesTokenCount),
      },
      problem: candidate.finishReason === "MAX_TOKENS" ? cutOff(name) : null,
    }
  },
}

async function post(
  name: string,
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<Record<string, unknown>> {
  let response: globalThis.Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error(`${name} could not be reached, or took too long to answer.`)
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `${name} turned down the saved key. Check it in Settings → AI.`
    )
  }
  if (!response.ok) {
    const detail = await response.text().then(
      (text) => text.slice(0, 300),
      () => ""
    )
    console.error(`${name} event drafting failed`, response.status, detail)
    throw new Error(`${name} answered with HTTP ${response.status}.`)
  }
  try {
    return record(await response.json())
  } catch {
    throw new Error(`${name} sent back an answer that could not be read.`)
  }
}

function cutOff(name: string): string {
  return `${name}'s answer was cut off because the page lists too many events. Point the step at a page with fewer.`
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** A provider's token count, or 0 when the answer's shape surprises us. */
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}
