import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { bodyToBytes, getFromR2 } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoMedia, aiVideoProjects } from "@/server/schema"
import { findCurrentUser } from "@/server/security"
import {
  ANALYSIS_MODEL,
  deleteGeminiFile,
  GEMINI_BASE_URL,
  requireGeminiKey,
  safeBody,
  uploadFileToGemini,
  waitForFileActive,
} from "@/server/video-analysis"
import type { ProjectTimeline } from "@/server/video-projects"
import type { EditorClip } from "@/pages/video-editor/editor-store"

// One caption line, already mapped to TIMELINE time (the client just turns
// these into text clips).
export type CaptionLine = { startMs: number; endMs: number; text: string }

export type ProjectCaptionsResult = { captions: CaptionLine[] }

const captionsSchema = z.object({
  captions: z
    .array(
      z.object({
        startMs: z.number().finite(),
        endMs: z.number().finite(),
        text: z.string().max(200),
      })
    )
    .max(1000),
})

type GeminiGenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
  }
  return user
}

function captionsPrompt(durationMs: number | null) {
  const durationLine = durationMs
    ? `The media is ${durationMs} ms long; every timestamp must lie between 0 and ${durationMs}.`
    : "Timestamps are integer milliseconds from the start of the media."
  return `You are creating subtitles for a short-form social video (TikTok/Instagram reel).
${durationLine}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "captions": [{ "startMs": 0, "endMs": 900, "text": "..." }] }

Rules:
- Transcribe ONLY the spoken words — ignore on-screen text, music, and sound effects.
- Split the speech into short caption chunks of AT MOST 4 words, each at most 1500 ms long.
- Chunks must follow the actual speech timing exactly and must not overlap.
- Keep the original language and natural casing.
- If there is no speech at all, return { "captions": [] }.`
}

// Picks the clip whose audio should be captioned: the longest audio clip on
// an unmuted track, else the longest unmuted video clip with media.
function findCaptionSource(timeline: ProjectTimeline) {
  let bestAudio: EditorClip | null = null
  let bestVideo: EditorClip | null = null
  for (const track of timeline.tracks ?? []) {
    if (track.muted) continue
    for (const clip of track.clips ?? []) {
      if (!clip.mediaId || !clip.durationMs) continue
      if (clip.kind === "audio") {
        if (!bestAudio || clip.durationMs > bestAudio.durationMs) {
          bestAudio = clip
        }
      } else if (clip.kind === "video") {
        if (!bestVideo || clip.durationMs > bestVideo.durationMs) {
          bestVideo = clip
        }
      }
    }
  }
  return bestAudio ?? bestVideo
}

// Transcribes the project's main audio source with Gemini and returns caption
// lines mapped into timeline time. Synchronous from the caller's view —
// short reels transcribe in seconds, so the UI just shows a spinner.
export async function generateProjectCaptionsForCurrentUser(
  projectId: string
): Promise<ProjectCaptionsResult> {
  requireAppOrigin()
  const user = await requireUser()

  const [project] = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, user.id))
    )
    .limit(1)
  if (!project) {
    throw new Error("Project not found")
  }

  const timeline = project.timeline as ProjectTimeline
  const source = findCaptionSource(timeline)
  if (!source?.mediaId) {
    throw new Error("No audible clip to caption")
  }

  // Owner-scoped media lookup, same as the render pipeline.
  const [media] = await db
    .select()
    .from(aiVideoMedia)
    .where(
      and(eq(aiVideoMedia.id, source.mediaId), eq(aiVideoMedia.userId, user.id))
    )
    .limit(1)
  if (!media) {
    throw new Error("A clip's media file no longer exists")
  }

  const object = await getFromR2(media.storagePath)
  const bytes = await bodyToBytes(object.Body)
  const sourceDurationMs = source.sourceDurationMs
    ? Math.round(source.sourceDurationMs)
    : null

  const raw = await transcribeWithGemini(bytes, media.mimeType, sourceDurationMs)
  return { captions: mapToTimeline(raw, source, sourceDurationMs) }
}

// Files API upload + one generateContent call, mirroring analyzeViralVideo.
async function transcribeWithGemini(
  bytes: Uint8Array,
  mimeType: string,
  durationMs: number | null
): Promise<CaptionLine[]> {
  const apiKey = requireGeminiKey()
  const file = await uploadFileToGemini(bytes, mimeType, apiKey)

  try {
    await waitForFileActive(file.name, apiKey)

    const response = await fetch(
      `${GEMINI_BASE_URL}/v1beta/models/${ANALYSIS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { file_data: { file_uri: file.uri, mime_type: mimeType } },
                { text: captionsPrompt(durationMs) },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    )

    if (!response.ok) {
      console.error("Gemini captions failed", await safeBody(response))
      throw new Error(`Caption generation failed (HTTP ${response.status})`)
    }

    const payload = (await response.json()) as GeminiGenerateResponse
    const text = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
    if (!text) {
      throw new Error("Caption generation returned no result")
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(text)
    } catch {
      throw new Error("Caption generation returned invalid JSON")
    }

    const parsed = captionsSchema.safeParse(parsedJson)
    if (!parsed.success) {
      throw new Error("Caption generation returned an unexpected shape")
    }
    return parsed.data.captions
  } finally {
    await deleteGeminiFile(file.name, apiKey)
  }
}

// Source-time captions → timeline-time captions: keep only the part of the
// transcript the clip actually plays (its trim window), shift by the clip's
// timeline position, and force non-overlap so they fit one timeline track.
function mapToTimeline(
  raw: CaptionLine[],
  source: EditorClip,
  sourceDurationMs: number | null
): CaptionLine[] {
  const windowStart = source.trimStartMs
  const windowEnd = source.trimStartMs + source.durationMs
  const offset = source.startMs - source.trimStartMs

  const mapped = raw
    .map((line) => {
      let startMs = Math.max(0, Math.round(line.startMs))
      let endMs = Math.max(0, Math.round(line.endMs))
      if (sourceDurationMs) {
        startMs = Math.min(startMs, sourceDurationMs)
        endMs = Math.min(endMs, sourceDurationMs)
      }
      return { startMs, endMs, text: line.text.trim() }
    })
    .filter(
      (line) =>
        line.text && line.endMs > windowStart && line.startMs < windowEnd
    )
    .map((line) => ({
      startMs: Math.max(line.startMs, windowStart) + offset,
      endMs: Math.min(line.endMs, windowEnd) + offset,
      text: line.text,
    }))
    .filter((line) => line.endMs > line.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  // Clamp each caption against the next so the track has no overlaps.
  for (let i = 0; i < mapped.length - 1; i++) {
    if (mapped[i].endMs > mapped[i + 1].startMs) {
      mapped[i].endMs = mapped[i + 1].startMs
    }
  }
  return mapped.filter((line) => line.endMs > line.startMs)
}
