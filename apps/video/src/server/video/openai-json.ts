import { z } from "zod"

/**
 * One question to OpenAI whose answer must be JSON in the shape given.
 *
 * The OpenAI half of what `generateJson` in `gemini.ts` does for Google, for
 * the tools that let either one do the writing. `label` starts every error it
 * can throw, so the message that reaches the screen says which feature went
 * wrong. The token counts come back with the answer for whoever is metering
 * the call; the call is never metered from here.
 */
export async function askOpenAiJson<T>({
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
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const body = await response.text().then(
      (detail) => detail.slice(0, 500),
      () => ""
    )
    console.error(`OpenAI ${label}`, response.status, body)
    throw new Error(`${label} failed (HTTP ${response.status})`)
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error(`${label} came back empty`)

  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    throw new Error(`${label} came back as something other than an answer`)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${label} came back in an unexpected shape`)
  }
  return {
    value: parsed.data,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
  }
}
