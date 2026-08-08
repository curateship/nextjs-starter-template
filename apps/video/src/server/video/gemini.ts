import { z } from "zod"

import {
  AI_TOO_BUSY_MESSAGE,
  GEMINI_KEY_MISSING_MESSAGE,
} from "@/lib/video/ai-providers"
import { getAiKey } from "@/server/ai/keys"

/**
 * Talking to Gemini.
 *
 * One place for the awkward parts: sending a file that is too big to inline,
 * waiting for Google to finish reading it, asking a question whose answer must
 * be JSON of a known shape, and tidying up afterwards. What the answer means is
 * each feature's own business.
 *
 * Every call is made through the shell's meter by its caller, never from here,
 * so a feature can decide what one call is and how much of it to charge for.
 */

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"

/**
 * Google answers "busy, try again" often enough that giving up on the first
 * one would make the feature feel broken.
 *
 * 500 and 503 are Google having a moment and clear in a second. 429 is
 * different: it means "you are asking too often", and the allowance it refers
 * to is usually counted per minute, so a wait of a second is no wait at all.
 * When Google says how long to leave it, that is what is waited.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 503])
const RETRY_DELAYS_MS = [1_000, 3_000]
const BUSY_RETRY_DELAYS_MS = [5_000, 20_000]
/** However long Google asks for, this is the longest anybody waits on a click. */
const MAX_RETRY_WAIT_MS = 30_000

/** How long Google asked us to leave it, when it says. */
function askedToWaitMs(body: string): number | null {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  if (!match) return null
  return Math.min(MAX_RETRY_WAIT_MS, Math.round(Number(match[1]) * 1000))
}

/**
 * Sound this size or smaller rides inside the request itself. Uploading it
 * separately means a round trip to send it and then waiting while Google reads
 * it — seconds of nothing, for a file that would have fitted in the question.
 * A minute of the sound this app sends is under two megabytes.
 */
export const GEMINI_INLINE_LIMIT_BYTES = 15 * 1024 * 1024

/** How long to wait for Google to finish reading an uploaded file. */
const FILE_POLL_TIMEOUT_MS = 90_000
const FILE_POLL_INTERVAL_MS = 1_000

export async function requireGeminiKey(): Promise<string> {
  const key = await getAiKey("gemini")
  if (!key) throw new Error(GEMINI_KEY_MISSING_MESSAGE)
  return key
}

/** Whatever the server log needs, without letting a huge body in. */
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
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

export type GeminiJsonAnswer<T> = {
  value: T
  inputTokens: number
  outputTokens: number
}

/**
 * One question whose answer must be JSON in the shape given.
 *
 * `label` starts every error it can throw ("Captions failed…"), so the message
 * that reaches the screen says which feature went wrong. The token counts come
 * back with the answer for whoever is metering the call.
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
    // An answer that came back empty or in the wrong shape is worth one more
    // go: the same question a second later usually answers properly. A refusal
    // or a broken key is not, and is thrown on as it is.
    const message = error instanceof Error ? error.message : ""
    if (!message.includes("came back")) throw error
    console.error(`Gemini ${options.label} answer, trying once more`, message)
    return askOnce(options)
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
  let response: Response | null = null
  for (let attempt = 0; ; attempt += 1) {
    response = await fetch(
      `${GEMINI_BASE_URL}/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    )
    if (response.ok) break

    const trouble = await safeBody(response)
    console.error(`Gemini ${label} failed`, trouble)
    const busy = response.status === 429
    const delayMs = busy
      ? (askedToWaitMs(trouble.body) ?? BUSY_RETRY_DELAYS_MS[attempt])
      : RETRY_DELAYS_MS[attempt]
    if (!RETRYABLE_STATUSES.has(response.status) || delayMs === undefined) {
      // Being turned away for asking too often is not a fault to report as
      // one — it is a thing to wait out, and saying so is more use than a
      // number.
      throw new Error(
        busy ? AI_TOO_BUSY_MESSAGE : `${label} failed (HTTP ${response.status})`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const payload = (await response.json()) as GeminiGenerateResponse
  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
  if (!text) throw new Error(`${label} came back empty`)

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`${label} came back as something other than an answer`)
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    console.error(`Gemini ${label} shape`, parsed.error.issues.slice(0, 3))
    throw new Error(`${label} came back in an unexpected shape`)
  }

  return {
    value: parsed.data,
    inputTokens: asTokenCount(payload.usageMetadata?.promptTokenCount),
    outputTokens: asTokenCount(payload.usageMetadata?.candidatesTokenCount),
  }
}

function asTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0
}

type GeminiFile = { name?: string; uri?: string; state?: string }

/**
 * Puts a file where Gemini can read it, runs the given work against it, and
 * removes it afterwards.
 *
 * Uploading rather than inlining because anything past about 20MB cannot ride
 * inside the request, and a few minutes of audio passes that easily. Google
 * throws the file away after a couple of days by itself; this does not wait
 * that long.
 */
export async function withGeminiFile<T>(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  label: string,
  run: (part: unknown) => Promise<T>
): Promise<T> {
  // Small enough to send with the question, which is most of the time.
  if (bytes.byteLength <= GEMINI_INLINE_LIMIT_BYTES) {
    return run({
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(bytes).toString("base64"),
      },
    })
  }

  const file = await uploadFileToGemini(bytes, mimeType, apiKey, label)
  try {
    await waitForFileActive(file.name, apiKey, label)
    return await run({
      file_data: { file_uri: file.uri, mime_type: mimeType },
    })
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
    throw new Error(`${label} could not send the sound (HTTP ${start.status})`)
  }

  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    // A plain view of the bytes, which is what fetch takes as a body.
    body: new Uint8Array(bytes).buffer as ArrayBuffer,
  })
  if (!finish.ok) {
    console.error(`Gemini ${label} upload finish`, await safeBody(finish))
    throw new Error(`${label} could not send the sound (HTTP ${finish.status})`)
  }

  const payload = (await finish.json()) as { file?: GeminiFile }
  if (!payload.file?.name || !payload.file.uri) {
    throw new Error(`${label} could not send the sound`)
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
      throw new Error(`${label} failed (HTTP ${response.status})`)
    }

    const file = (await response.json()) as GeminiFile
    if (file.state === "ACTIVE") return
    if (file.state === "FAILED") {
      throw new Error(`${label} could not read the sound`)
    }
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS))
  }

  throw new Error(`${label} took too long`)
}
