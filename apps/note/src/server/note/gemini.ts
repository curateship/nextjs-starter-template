import { z } from "zod"

import { getAiKey } from "@/server/ai/keys"
import { SayableError } from "@/server/note/sayable"
import { NOTE_SAYS } from "@/lib/note/videos"

/**
 * Talking to Gemini, copied from the Video app's `src/server/video/gemini.ts`.
 *
 * One place for the awkward parts: sending a file too big to ride inside the
 * question, waiting for Google to finish reading it, asking for an answer
 * that must be JSON of a known shape, and waiting out "busy". What the answer
 * means is `analysis.ts`'s business, and every call is metered there.
 */

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"

/** Being turned away for asking too often. A thing to wait out, not a fault. */
export const AI_TOO_BUSY_MESSAGE =
  "Google is turning requests away right now. Wait a minute and try again."

/** The free tier's day is used up, and waiting a minute will not bring it back. */
export const AI_DAY_USED_UP_MESSAGE =
  "This Gemini key's free allowance for today is used up. It resets tomorrow, or add billing to the key."

/**
 * 500 and 503 are usually Google having a moment and clear in a second. 429,
 * and a 503 saying the model is "experiencing high demand", are waited out
 * for longer, and for as long as Google asks when it says.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 503])
const RETRY_DELAYS_MS = [1_000, 3_000]
const BUSY_RETRY_DELAYS_MS = [5_000, 20_000]
const MAX_RETRY_WAIT_MS = 30_000

/**
 * Sound this size or smaller rides inside the request. Thirty minutes of the
 * mp3 the worker makes is about 11MB, so nearly every video goes this way.
 */
export const GEMINI_INLINE_LIMIT_BYTES = 15 * 1024 * 1024

const FILE_POLL_TIMEOUT_MS = 90_000
const FILE_POLL_INTERVAL_MS = 1_000

export async function requireGeminiKey(): Promise<string> {
  const key = await getAiKey("gemini")
  if (!key) throw new SayableError(NOTE_SAYS.noGeminiKey)
  return key
}

function askedToWaitMs(body: string): number | null {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  if (!match) return null
  return Math.min(MAX_RETRY_WAIT_MS, Math.round(Number(match[1]) * 1000))
}

async function safeBody(response: Response) {
  return {
    status: response.status,
    body: await response.text().then(
      (text) => text.slice(0, 800),
      () => ""
    ),
  }
}

type GeminiGenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

export type GeminiJsonAnswer<T> = {
  value: T
  inputTokens: number
  outputTokens: number
}

/**
 * An answer Google sent and charged for, that was not the answer asked for:
 * empty, not JSON, or the wrong shape. It carries what it cost, so asking
 * again can add that to the meter instead of losing it.
 */
class UnusableAnswer extends SayableError {
  readonly inputTokens: number
  readonly outputTokens: number

  constructor(message: string, inputTokens: number, outputTokens: number) {
    super(message)
    this.inputTokens = inputTokens
    this.outputTokens = outputTokens
  }
}

/**
 * One question whose answer must be JSON in the shape given. An answer that
 * came back empty or in the wrong shape is asked once more, and both answers'
 * tokens are counted; anything else is thrown as it is. `label` starts every
 * error, so the card says which step went wrong.
 */
export async function generateJson<T>(options: {
  apiKey: string
  model: string
  parts: unknown[]
  schema: z.ZodType<T>
  label: string
}): Promise<GeminiJsonAnswer<T>> {
  try {
    return await askOnce(options)
  } catch (error) {
    if (!(error instanceof UnusableAnswer)) throw error
    console.error(`Gemini ${options.label} answer, trying once more`, error.message)
    const second = await askOnce(options)
    return {
      ...second,
      inputTokens: second.inputTokens + error.inputTokens,
      outputTokens: second.outputTokens + error.outputTokens,
    }
  }
}

async function askOnce<T>({
  apiKey,
  model,
  parts,
  schema,
  label,
}: {
  apiKey: string
  model: string
  parts: unknown[]
  schema: z.ZodType<T>
  label: string
}): Promise<GeminiJsonAnswer<T>> {
  let response: Response
  for (let attempt = 0; ; attempt += 1) {
    response = await fetch(`${GEMINI_BASE_URL}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    })
    if (response.ok) break

    const trouble = await safeBody(response)
    console.error(`Gemini ${label} failed`, trouble)
    const busy =
      response.status === 429 ||
      (response.status === 503 && /high demand|overloaded/i.test(trouble.body))
    if (busy && /free_tier|per day|PerDay/i.test(trouble.body)) {
      throw new SayableError(AI_DAY_USED_UP_MESSAGE)
    }
    const delayMs = busy
      ? (askedToWaitMs(trouble.body) ?? BUSY_RETRY_DELAYS_MS[attempt])
      : RETRY_DELAYS_MS[attempt]
    if (!RETRYABLE_STATUSES.has(response.status) || delayMs === undefined) {
      throw new SayableError(busy ? AI_TOO_BUSY_MESSAGE : `${label} failed (HTTP ${response.status})`)
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const payload = (await response.json()) as GeminiGenerateResponse
  const inputTokens = asTokenCount(payload.usageMetadata?.promptTokenCount)
  const outputTokens = asTokenCount(payload.usageMetadata?.candidatesTokenCount)
  const unusable = (message: string) => new UnusableAnswer(message, inputTokens, outputTokens)
  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
  if (!text) throw unusable(`${label} came back empty`)

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw unusable(`${label} came back as something other than an answer`)
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    console.error(`Gemini ${label} shape`, parsed.error.issues.slice(0, 3))
    throw unusable(`${label} came back in an unexpected shape`)
  }

  return {
    value: parsed.data,
    inputTokens,
    outputTokens,
  }
}

function asTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}

type GeminiFile = { name?: string; uri?: string; state?: string }

/**
 * Puts a file where Gemini can read it, runs the work against it, and removes
 * it afterwards. Small files ride inside the question; bigger ones go up
 * Google's own upload first.
 */
export async function withGeminiFile<T>(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  label: string,
  run: (part: unknown) => Promise<T>
): Promise<T> {
  if (bytes.byteLength <= GEMINI_INLINE_LIMIT_BYTES) {
    return run({
      inline_data: { mime_type: mimeType, data: Buffer.from(bytes).toString("base64") },
    })
  }

  const file = await uploadFileToGemini(bytes, mimeType, apiKey, label)
  try {
    await waitForFileActive(file.name, apiKey, label)
    return await run({ file_data: { file_uri: file.uri, mime_type: mimeType } })
  } finally {
    await fetch(`${GEMINI_BASE_URL}/v1beta/${file.name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
    }).catch(() => undefined)
  }
}

async function uploadFileToGemini(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  label: string
): Promise<{ name: string; uri: string }> {
  const start = await fetch(`${GEMINI_BASE_URL}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: label } }),
  })

  const uploadUrl = start.headers.get("x-goog-upload-url")
  if (!start.ok || !uploadUrl) {
    console.error(`Gemini ${label} upload start`, await safeBody(start))
    throw new SayableError(`${label} could not send the sound (HTTP ${start.status})`)
  }

  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: new Uint8Array(bytes).buffer as ArrayBuffer,
  })
  if (!finish.ok) {
    console.error(`Gemini ${label} upload finish`, await safeBody(finish))
    throw new SayableError(`${label} could not send the sound (HTTP ${finish.status})`)
  }

  const payload = (await finish.json()) as { file?: GeminiFile }
  if (!payload.file?.name || !payload.file.uri) {
    throw new SayableError(`${label} could not send the sound`)
  }
  return { name: payload.file.name, uri: payload.file.uri }
}

async function waitForFileActive(name: string, apiKey: string, label: string) {
  const deadline = Date.now() + FILE_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const response = await fetch(`${GEMINI_BASE_URL}/v1beta/${name}`, {
      headers: { "x-goog-api-key": apiKey },
    })
    if (!response.ok) {
      console.error(`Gemini ${label} file check`, await safeBody(response))
      throw new SayableError(`${label} failed (HTTP ${response.status})`)
    }
    const file = (await response.json()) as GeminiFile
    if (file.state === "ACTIVE") return
    if (file.state === "FAILED") throw new SayableError(`${label} could not read the sound`)
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS))
  }
  throw new SayableError(`${label} took too long`)
}
