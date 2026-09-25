import { z } from "zod"

/**
 * One question to Claude whose answer must be JSON in the shape given.
 *
 * The Anthropic half of what `askOpenAiJson` does for OpenAI, and it hands
 * back the same shape so the tools that ask for words never care which one
 * answered. Plain `fetch` like the other two callers rather than the SDK, so
 * the app carries no extra package for one request.
 *
 * `label` starts every error it can throw, so the message that reaches the
 * screen says which feature went wrong. The call is never metered from here.
 */

const ANTHROPIC_VERSION = "2023-06-01"

/**
 * Asks the API to run the same question on another Claude model if its safety
 * check turns this one down, instead of handing back a refusal. "default" lets
 * Anthropic pick the substitute, so there is no model name here to go stale.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01"

export async function askAnthropicJson<T>({
  apiKey,
  model,
  prompt,
  schema,
  label,
  timeoutMs = 60_000,
}: {
  apiKey: string
  model: string
  prompt: string
  schema: z.ZodType<T>
  label: string
  timeoutMs?: number
}): Promise<{ value: T; inputTokens: number; outputTokens: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": FALLBACK_BETA,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16_000,
      // Rewording a line needs little thought; low effort keeps it quick and
      // keeps the thinking it is billed for small.
      output_config: { effort: "low" },
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const body = await response.text().then(
      (detail) => detail.slice(0, 500),
      () => ""
    )
    console.error(`Anthropic ${label}`, response.status, body)
    throw new Error(`${label} failed (HTTP ${response.status})`)
  }
  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[]
    stop_reason?: string
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const usage = {
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
  }
  if (payload.stop_reason === "refusal") {
    throw new Error(`${label} came back empty`)
  }
  const text = (payload.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("")
    .trim()
  if (!text) throw new Error(`${label} came back empty`)

  let raw: unknown
  try {
    raw = JSON.parse(withoutCodeFence(text))
  } catch {
    throw new Error(`${label} came back as something other than an answer`)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${label} came back in an unexpected shape`)
  }
  return { value: parsed.data, ...usage }
}

/** Claude sometimes wraps JSON in a ```json block even when asked not to. */
function withoutCodeFence(text: string) {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text)
  return fenced ? fenced[1] : text
}
