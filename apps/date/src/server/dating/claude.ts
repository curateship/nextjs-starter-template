import { z } from "zod"

/**
 * One question to Claude whose answer must be JSON in a given shape, with
 * pictures when there are any.
 *
 * Plain `fetch`, like Video's `askAnthropicJson` and the shell's key test,
 * because adding Anthropic's SDK would mean editing the app's `package.json`,
 * a shell file. The answer's shape is asked for through structured outputs
 * (`output_config.format`) and checked again here, so a reply in any other
 * shape is an error rather than a guess.
 *
 * If Claude's safety check turns the question down, the API runs it on a
 * substitute model instead (the `fallbacks: "default"` setting the claude-api
 * skill recommends). A refusal that still comes back is reported as one, so
 * the caller can say "the AI would not read this" rather than fail.
 */

const ANTHROPIC_VERSION = "2023-06-01"
const FALLBACK_BETA = "server-side-fallback-2026-07-01"

export type ClaudeImage = { jpeg: Buffer }

export type ClaudeQuestion<T> = {
  apiKey: string
  model: string
  system: string
  /** The question's words, after its pictures. */
  text: string
  images?: ClaudeImage[]
  /** The answer's shape, as the API is told it: objects with every key required and no others. */
  jsonSchema: Record<string, unknown>
  /** The same shape, checked here. */
  schema: z.ZodType<T>
  effort: "low" | "medium" | "high"
  /** Starts every error, so the words on screen say which job went wrong. */
  label: string
  timeoutMs?: number
}

export type ClaudeAnswer<T> =
  | { refused: false; value: T; inputTokens: number; outputTokens: number }
  | { refused: true; inputTokens: number; outputTokens: number }

export async function askClaude<T>(question: ClaudeQuestion<T>): Promise<ClaudeAnswer<T>> {
  const content = [
    ...(question.images ?? []).map((image) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: image.jpeg.toString("base64") },
    })),
    { type: "text", text: question.text },
  ]
  let response: Response
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": question.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": FALLBACK_BETA,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: question.model,
        max_tokens: 16_000,
        system: question.system,
        output_config: { effort: question.effort, format: { type: "json_schema", schema: question.jsonSchema } },
        fallbacks: "default",
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(question.timeoutMs ?? 120_000),
    })
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? `${question.label}: Anthropic did not answer within two minutes.`
        : `${question.label}: Anthropic could not be reached.`
    )
  }
  if (!response.ok) {
    const detail = await response.text().then(
      (body) => body.slice(0, 500),
      () => ""
    )
    console.error(`Anthropic ${question.label}`, response.status, detail)
    throw new Error(`${question.label}: Anthropic answered with an error (HTTP ${response.status})${reasonOf(detail)}.`)
  }
  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[]
    stop_reason?: string
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const usage = { inputTokens: payload.usage?.input_tokens ?? 0, outputTokens: payload.usage?.output_tokens ?? 0 }
  if (payload.stop_reason === "refusal") return { refused: true, ...usage }
  if (payload.stop_reason === "max_tokens") throw new Error(`${question.label}: the AI's answer was cut off.`)
  const text = (payload.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("")
    .trim()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`${question.label}: the AI's answer was not in the shape asked for.`)
  }
  const parsed = question.schema.safeParse(raw)
  if (!parsed.success) throw new Error(`${question.label}: the AI's answer was not in the shape asked for.`)
  return { refused: false, value: parsed.data, ...usage }
}

/** Anthropic's own sentence, such as "Your credit balance is too low", when it sent one. */
function reasonOf(detail: string): string {
  try {
    const message = (JSON.parse(detail) as { error?: { message?: string } }).error?.message?.trim().replace(/[.!]+$/, "")
    return message ? `: ${message}` : ""
  } catch {
    return ""
  }
}
