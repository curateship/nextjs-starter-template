import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { getLlmKey } from "@/server/llm-keys"
import { bodyToBytes, getFromR2 } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import { extractAudioWav } from "@/server/video-download"
import { aiVideoMedia, aiVideoProjects } from "@/server/schema"
import { requireUser } from "@/server/security"
import {
  deleteGeminiFile,
  generateJson,
  requireGeminiKey,
  uploadFileToGemini,
  waitForFileActive,
} from "@/server/video-analysis"
import type { ProjectTimeline } from "@/server/video-projects"
import type { ClipWord, EditorClip } from "@/pages/video-editor/editor-store"

// One caption line, already mapped to TIMELINE time (the client just turns
// these into text clips). `words` (OpenAI/Whisper only) carries clip-relative
// per-word timings for voice-synced ("karaoke") captions.
export type CaptionLine = {
  startMs: number
  endMs: number
  text: string
  words?: ClipWord[]
}

export type ProjectCaptionsResult = { captions: CaptionLine[] }

// Which model transcribes the audio. Gemini estimates timestamps; OpenAI's
// Whisper returns forced-aligned word timings (tighter sync). Claude can't do
// audio, so it isn't an option here.
export type CaptionProvider = "gemini" | "openai"

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
  projectId: string,
  provider: CaptionProvider = "gemini"
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

  // Transcribe the AUDIO track, not the video: Gemini samples video at ~1 fps,
  // which makes caption timestamps coarse and laggy. Fall back to the original
  // file if audio extraction fails (e.g. ffmpeg unavailable).
  const audio = await extractAudioWav(bytes, media.mimeType)
  const audioBytes = audio ?? bytes
  const audioMime = audio ? "audio/wav" : media.mimeType

  const raw =
    provider === "openai"
      ? await transcribeWithOpenAI(audioBytes, audioMime)
      : await transcribeWithGemini(audioBytes, audioMime, sourceDurationMs)
  return { captions: mapToTimeline(raw, source, sourceDurationMs) }
}

// OpenAI Whisper transcription with word-level timestamps (forced-aligned, so
// tighter than Gemini's estimates), grouped into short caption chunks.
async function transcribeWithOpenAI(
  bytes: Uint8Array,
  mimeType: string
): Promise<CaptionLine[]> {
  const apiKey = await getLlmKey("openai")
  if (!apiKey) {
    throw new Error("OpenAI key is not configured")
  }

  const ext = mimeType.includes("wav")
    ? "wav"
    : mimeType.includes("webm")
      ? "webm"
      : "mp4"
  const form = new FormData()
  form.append("file", new Blob([bytes], { type: mimeType }), `audio.${ext}`)
  form.append("model", "whisper-1")
  form.append("response_format", "verbose_json")
  form.append("timestamp_granularities[]", "word")

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    }
  )
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    console.error("OpenAI transcription failed", response.status, detail)
    throw new Error(`Caption generation failed (HTTP ${response.status})`)
  }

  const payload = (await response.json()) as {
    words?: { word: string; start: number; end: number }[]
  }
  return chunkWords(payload.words ?? [])
}

// Groups word timings into caption-sized chunks (≤ 4 words / ≤ 1.5s), matching
// the reel-caption style the Gemini prompt asks for. Exported so the ElevenLabs
// voice module can turn its word timings into the same karaoke caption lines.
export function chunkWords(
  words: { word: string; start: number; end: number }[]
): CaptionLine[] {
  const lines: CaptionLine[] = []
  let chunk: { word: string; start: number; end: number }[] = []

  const flush = () => {
    if (chunk.length === 0) return
    const chunkStart = chunk[0].start
    lines.push({
      startMs: Math.round(chunkStart * 1000),
      endMs: Math.round(chunk[chunk.length - 1].end * 1000),
      // Join words, then tuck punctuation back against the previous word.
      text: chunk
        .map((w) => w.word)
        .join(" ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .trim(),
      // Clip-relative word timings (offsets from the chunk start) for karaoke.
      words: chunk.map((w) => ({
        text: w.word.trim(),
        startMs: Math.round((w.start - chunkStart) * 1000),
        endMs: Math.round((w.end - chunkStart) * 1000),
      })),
    })
    chunk = []
  }

  for (const word of words) {
    const span = chunk.length ? word.end - chunk[0].start : 0
    if (chunk.length >= 4 || span > 1.5) flush()
    chunk.push(word)
  }
  flush()
  return lines.filter((line) => line.text && line.endMs > line.startMs)
}

// Files API upload + one generateContent call, mirroring analyzeViralVideo.
async function transcribeWithGemini(
  bytes: Uint8Array,
  mimeType: string,
  durationMs: number | null
): Promise<CaptionLine[]> {
  const apiKey = await requireGeminiKey()
  const file = await uploadFileToGemini(bytes, mimeType, apiKey)

  try {
    await waitForFileActive(file.name, apiKey)
    const result = await generateJson(
      [
        { file_data: { file_uri: file.uri, mime_type: mimeType } },
        { text: captionsPrompt(durationMs) },
      ],
      captionsSchema,
      "Caption generation"
    )
    return result.captions
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
      return { startMs, endMs, text: line.text.trim(), words: line.words }
    })
    .filter(
      (line) =>
        line.text && line.endMs > windowStart && line.startMs < windowEnd
    )
    .map((line) => ({
      startMs: Math.max(line.startMs, windowStart) + offset,
      endMs: Math.min(line.endMs, windowEnd) + offset,
      text: line.text,
      // Word offsets are relative to the line start, so they ride along
      // unchanged when the line is shifted into timeline time.
      words: line.words,
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
