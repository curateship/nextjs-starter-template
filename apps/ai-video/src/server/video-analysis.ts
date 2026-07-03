import { z } from "zod"

import { withApiUsage, type ApiUsageAction } from "@/server/api-usage"
import { getLlmKey } from "@/server/llm-keys"

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
// Flash handles video input and is cheap enough to run per archived reel.
export const ANALYSIS_MODEL = "gemini-2.5-flash"
// Gemini marks uploaded files ACTIVE once processed; short videos take seconds.
const FILE_POLL_INTERVAL_MS = 2_000
const FILE_POLL_TIMEOUT_MS = 120_000

// Narrative roles a segment of a viral short can play.
export const SEGMENT_ROLES = [
  "hook",
  "problem",
  "agitation",
  "solution",
  "proof",
  "cta",
  "other",
] as const

export type SegmentRole = (typeof SEGMENT_ROLES)[number]

export type ViralVideoAnalysis = {
  transcript: { startMs: number; endMs: number; text: string }[]
  segments: {
    role: SegmentRole
    startMs: number
    endMs: number
    summary: string
  }[]
  scenes: { startMs: number; endMs: number }[]
}

// Bounded mirror of the JSON the prompt requests; unknown roles fall back to
// "other" instead of failing the whole analysis.
const analysisSchema = z.object({
  transcript: z
    .array(
      z.object({
        startMs: z.number().finite(),
        endMs: z.number().finite(),
        text: z.string().max(2000),
      })
    )
    .max(1000),
  segments: z
    .array(
      z.object({
        role: z.enum(SEGMENT_ROLES).catch("other"),
        startMs: z.number().finite(),
        endMs: z.number().finite(),
        summary: z.string().max(2000),
      })
    )
    .max(200),
  scenes: z
    .array(
      z.object({
        startMs: z.number().finite(),
        endMs: z.number().finite(),
      })
    )
    .max(500),
})

type GeminiGenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] }
  }[]
}

type GeminiFile = {
  name?: string
  uri?: string
  state?: string
}

export async function requireGeminiKey() {
  // Prefer a key saved in Settings → AI Providers, falling back to the env var.
  const apiKey = await getLlmKey("gemini")
  if (!apiKey) {
    throw new Error("Video analysis is not configured")
  }
  return apiKey
}

function analysisPrompt(durationMs: number | null) {
  const durationLine = durationMs
    ? `The video is ${durationMs} ms long; every timestamp must lie between 0 and ${durationMs}.`
    : "Timestamps are integer milliseconds from the start of the video."
  return `You are analyzing a short-form social video (TikTok/Instagram reel) for a marketer studying why it went viral.
${durationLine}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "transcript": [{ "startMs": 0, "endMs": 1200, "text": "..." }],
  "segments": [{ "role": "hook", "startMs": 0, "endMs": 2400, "summary": "..." }],
  "scenes": [{ "startMs": 0, "endMs": 800 }]
}

Rules:
- "transcript": every distinct line of speech plus important on-screen text, in order. List each distinct line ONCE, with startMs/endMs spanning the full time it is spoken or stays visible — never repeat the same line at intervals while it remains on screen.
- "segments": the narrative pattern of the video. Allowed roles: "hook", "problem", "agitation", "solution", "proof", "cta", "other". Segments must be contiguous, cover the whole video, and each "summary" should explain in one sentence what that part does and why it works.
- "scenes": the visual shot boundaries, contiguous from 0 to the end of the video. A new scene starts ONLY at a real visual cut or camera/shot change — locate the actual cut points and use their exact timestamps. NEVER divide the video into equal-length intervals; scene lengths should vary like real edits do. If the whole video is one continuous shot, return a single scene covering it.`
}

// One generateContent round-trip that must return JSON matching `schema`.
// `label` prefixes every error ("Video analysis", "Caption generation", …) so
// the lib/api safe-error sets keep their exact message strings.
export async function generateJson<T>(
  parts: unknown[],
  schema: z.ZodType<T>,
  label: string,
  usage?: { userId: string; action: ApiUsageAction }
): Promise<T> {
  const apiKey = await requireGeminiKey()
  const run = async () => {
    const response = await fetch(
      `${GEMINI_BASE_URL}/v1beta/models/${ANALYSIS_MODEL}:generateContent`,
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

    if (!response.ok) {
      // Surface the status + Google's error body in the server log.
      console.error(`Gemini ${label} failed`, await safeBody(response))
      throw new Error(`${label} failed (HTTP ${response.status})`)
    }
    return response
  }
  const response = usage
    ? await withApiUsage(usage.userId, usage.action, run)
    : await run()

  const payload = (await response.json()) as GeminiGenerateResponse
  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
  if (!text) {
    throw new Error(`${label} returned no result`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${label} returned an unexpected shape`)
  }
  return parsed.data
}

// Full pipeline: upload the video bytes to the Gemini Files API, wait until
// processed, run one generateContent call, validate + clamp the JSON.
export async function analyzeViralVideo(
  userId: string,
  bytes: Uint8Array,
  mimeType: string,
  durationMs: number | null
): Promise<ViralVideoAnalysis> {
  const apiKey = await requireGeminiKey()
  return withApiUsage(
    userId,
    {
      provider: "gemini",
      feature: "video_analysis",
      model: ANALYSIS_MODEL,
    },
    async () => {
      return withActiveGeminiFile(bytes, mimeType, apiKey, async (file) => {
        const analysis = await generateJson(
          [
            { file_data: { file_uri: file.uri, mime_type: mimeType } },
            { text: analysisPrompt(durationMs) },
          ],
          analysisSchema,
          "Video analysis"
        )
        return cleanAnalysis(analysis, durationMs)
      })
    }
  )
}

export async function withActiveGeminiFile<T>(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  run: (file: { name: string; uri: string }) => Promise<T>
) {
  const file = await uploadFileToGemini(bytes, mimeType, apiKey)

  try {
    await waitForFileActive(file.name, apiKey)
    return await run(file)
  } finally {
    // Files auto-expire after 48h, but don't leave them lying around.
    await deleteGeminiFile(file.name, apiKey)
  }
}

// Resumable upload (start + single upload/finalize chunk) — required because
// reels regularly exceed the 20MB inline-data limit.
export async function uploadFileToGemini(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string
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
    body: JSON.stringify({ file: { display_name: "viral-video" } }),
  })

  const uploadUrl = start.headers.get("x-goog-upload-url")
  if (!start.ok || !uploadUrl) {
    console.error("Gemini upload start failed", await safeBody(start))
    throw new Error(`Video analysis upload failed (HTTP ${start.status})`)
  }

  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  })
  if (!finish.ok) {
    console.error("Gemini upload finalize failed", await safeBody(finish))
    throw new Error(`Video analysis upload failed (HTTP ${finish.status})`)
  }

  const payload = (await finish.json()) as { file?: GeminiFile }
  if (!payload.file?.name || !payload.file.uri) {
    throw new Error("Video analysis upload failed")
  }
  return { name: payload.file.name, uri: payload.file.uri }
}

export async function waitForFileActive(name: string, apiKey: string) {
  const deadline = Date.now() + FILE_POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const response = await fetch(`${GEMINI_BASE_URL}/v1beta/${name}`, {
      headers: { "x-goog-api-key": apiKey },
    })
    if (!response.ok) {
      console.error("Gemini file poll failed", await safeBody(response))
      throw new Error(`Video analysis failed (HTTP ${response.status})`)
    }

    const file = (await response.json()) as GeminiFile
    if (file.state === "ACTIVE") return
    if (file.state === "FAILED") {
      throw new Error("Video analysis could not process the video")
    }

    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS))
  }

  throw new Error("Video analysis timed out")
}

// Best-effort body text for error logging (never throws).
export async function safeBody(response: Response) {
  return response.text().catch(() => "<unreadable body>")
}

export async function deleteGeminiFile(name: string, apiKey: string) {
  await fetch(`${GEMINI_BASE_URL}/v1beta/${name}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": apiKey },
  }).catch(() => undefined)
}

// Round + clamp every range into [0, durationMs], drop empty ones, and keep
// each list ordered — downstream code (template slots) relies on this.
function cleanAnalysis(
  analysis: ViralVideoAnalysis,
  durationMs: number | null
): ViralVideoAnalysis {
  function cleanRanges<T extends { startMs: number; endMs: number }>(
    ranges: T[]
  ): T[] {
    return ranges
      .map((range) => {
        const startMs = clampTime(range.startMs, durationMs)
        const endMs = clampTime(range.endMs, durationMs)
        return { ...range, startMs, endMs }
      })
      .filter((range) => range.endMs > range.startMs)
      .sort((a, b) => a.startMs - b.startMs)
  }

  return {
    transcript: cleanRanges(analysis.transcript),
    segments: cleanRanges(analysis.segments),
    scenes: cleanRanges(analysis.scenes),
  }
}

function clampTime(value: number, durationMs: number | null) {
  const rounded = Math.max(0, Math.round(value))
  return durationMs ? Math.min(rounded, durationMs) : rounded
}
