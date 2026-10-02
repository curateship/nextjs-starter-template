import { z } from "zod"

import { runAiCall } from "@/server/ai/usage"
import {
  generateJson,
  requireGeminiKey,
  withGeminiFile,
} from "@/server/video/gemini"
import { SEGMENT_ROLES, type ViralBreakdown } from "@/lib/video/viral-breakdown"

/**
 * Having Gemini watch a saved video and write down how it works.
 *
 * The question is the old app's, word for word, because its wording is what
 * stops two mistakes the model makes on its own: repeating a caption once a
 * second for as long as it is on screen, and carving the video into equal
 * slices instead of finding the real cuts.
 *
 * One call, one meter row. Retries inside `generateJson` ride inside the same
 * reserved call, so a model having a moment never charges twice.
 */

/** Flash reads video, and is cheap enough to run on every saved video. */
const ANALYSIS_MODEL = "gemini-2.5-flash"

/** Starts every error this can throw, so the row says which step failed. */
const LABEL = "The breakdown"

/**
 * A bounded mirror of the JSON the question asks for. An unknown role becomes
 * "other" rather than failing the whole breakdown — one odd label is not worth
 * throwing away a transcript and the scene cuts.
 */
const breakdownSchema = z.object({
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

/**
 * The old app's prompt, unchanged. The two shouted words ("ONCE", "NEVER") are
 * load-bearing: without them the model repeats a caption at intervals and
 * divides the video into equal scenes, which makes the scene list useless.
 */
function breakdownPrompt(durationMs: number | null) {
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

/**
 * Watches one video and returns its breakdown, metered against the person who
 * asked for it. Throws a finished sentence when Gemini cannot be reached, has
 * no key, or answers something that is not a breakdown twice running.
 */
export async function breakDownVideo({
  userId,
  bytes,
  mimeType,
  durationSeconds,
  savedVideoId,
}: {
  userId: string
  bytes: Uint8Array
  mimeType: string
  durationSeconds: number | null
  savedVideoId: string
}): Promise<ViralBreakdown> {
  const apiKey = await requireGeminiKey()
  const durationMs = durationSeconds ? Math.round(durationSeconds * 1000) : null

  const answer = await runAiCall(
    {
      userId,
      provider: "gemini",
      model: ANALYSIS_MODEL,
      feature: "viral_breakdown",
      metadata: { savedVideoId },
    },
    async () => {
      const result = await withGeminiFile(
        bytes,
        mimeType,
        apiKey,
        LABEL,
        (video) =>
          generateJson({
            apiKey,
            model: ANALYSIS_MODEL,
            parts: [video, { text: breakdownPrompt(durationMs) }],
            schema: breakdownSchema,
            label: LABEL,
          })
      )
      return {
        result: result.value,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      }
    }
  )

  return tidyBreakdown(answer, durationMs)
}

/**
 * Rounds and clamps every range into the video, drops the empty ones and puts
 * each list in order. The screen jumps the player to these numbers, so a
 * segment ending after the video does would seek past the end.
 */
export function tidyBreakdown(
  breakdown: ViralBreakdown,
  durationMs: number | null
): ViralBreakdown {
  function tidy<T extends { startMs: number; endMs: number }>(ranges: T[]): T[] {
    return ranges
      .map((range) => ({
        ...range,
        startMs: clamp(range.startMs, durationMs),
        endMs: clamp(range.endMs, durationMs),
      }))
      .filter((range) => range.endMs > range.startMs)
      .sort((left, right) => left.startMs - right.startMs)
  }

  return {
    transcript: tidy(breakdown.transcript),
    segments: tidy(breakdown.segments),
    scenes: tidy(breakdown.scenes),
  }
}

function clamp(value: number, durationMs: number | null): number {
  const rounded = Math.max(0, Math.round(value))
  return durationMs ? Math.min(rounded, durationMs) : rounded
}

/** Reads a stored breakdown back, or null when the row has none yet. */
export function readStoredBreakdown(value: unknown): ViralBreakdown | null {
  const parsed = breakdownSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
