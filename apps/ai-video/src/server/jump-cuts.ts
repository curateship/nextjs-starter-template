import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { and, eq } from "drizzle-orm"

import {
  detectFillerRanges,
  sanitizeFillerTerms,
} from "../lib/filler-words.ts"
import {
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "../lib/timeline-schema.ts"
import type { EditorClip } from "../pages/video-editor/editor-store.ts"
import { MIN_CLIP_MS } from "../pages/video-editor/timeline-utils.ts"
import { mediaExtensionForMimeType } from "./media-types.ts"

export type JumpCutSensitivity = "conservative" | "balanced" | "tight"
export type JumpCutConfidence = "low" | "medium" | "high"
// "dead-air" removes silence/speech pauses (the original behavior); "filler"
// removes spoken filler words from the same transcription pass.
export type JumpCutMode = "dead-air" | "filler"

export type JumpCutWord = {
  text: string
  startMs: number
  endMs: number
}

export type JumpCutRange = {
  startMs: number
  endMs: number
}

export type JumpCutSuggestion = {
  id: string
  sourceStartMs: number
  sourceEndMs: number
  clipStartMs: number
  clipEndMs: number
  timelineStartMs: number
  timelineEndMs: number
  reason: string
  confidence: JumpCutConfidence
  removedDurationMs: number
}

export type JumpCutAnalysisResult = {
  suggestions: JumpCutSuggestion[]
}

const MIN_REMOVAL_MS = 250
const MERGE_GAP_MS = 150
const FFMPEG_TIMEOUT_MS = 60_000
export const JUMP_CUT_MAX_MEDIA_BYTES = 100 * 1024 * 1024
export const JUMP_CUT_MAX_WINDOW_MS = 10 * 60 * 1000

const activeJumpCutAnalyses = new Set<string>()

const SENSITIVITY_CONFIG: Record<
  JumpCutSensitivity,
  { minGapMs: number; paddingMs: number }
> = {
  conservative: { minGapMs: 700, paddingMs: 120 },
  balanced: { minGapMs: 500, paddingMs: 90 },
  tight: { minGapMs: 350, paddingMs: 60 },
}

type JumpCutCandidate = JumpCutRange & {
  speech: boolean
  silence: boolean
}

export async function analyzeJumpCutsForCurrentUser(data: {
  projectId: string
  clipId: string
  sensitivity: JumpCutSensitivity
  mode?: JumpCutMode
  fillerTerms?: string[]
}): Promise<JumpCutAnalysisResult> {
  const mode: JumpCutMode = data.mode ?? "dead-air"
  const fillerTerms = sanitizeFillerTerms(data.fillerTerms)
  if (mode === "filler" && !fillerTerms.length) {
    return { suggestions: [] }
  }
  const { db } = await import("./db.ts")
  const { bodyToBytes, getFromR2 } = await import("./media-storage.ts")
  const { requireAppOrigin } = await import("./origin.ts")
  const { aiVideoMedia, aiVideoProjects } = await import("./schema.ts")
  const { requireUser } = await import("./security.ts")

  requireAppOrigin()
  const user = await requireUser()
  const [project] = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(
        eq(aiVideoProjects.id, data.projectId),
        eq(aiVideoProjects.userId, user.id)
      )
    )
    .limit(1)

  if (!project) {
    throw new Error("Project not found")
  }

  const timeline = requireCanonicalTimeline(project.timeline)
  const clip = findTimelineClip(timeline, data.clipId)
  if (!clip || !clip.mediaId || !isJumpCutClip(clip)) {
    throw new Error("Select a video or audio clip first")
  }
  if (clip.durationMs < MIN_CLIP_MS * 2) {
    return { suggestions: [] }
  }

  const [media] = await db
    .select()
    .from(aiVideoMedia)
    .where(
      and(eq(aiVideoMedia.id, clip.mediaId), eq(aiVideoMedia.userId, user.id))
    )
    .limit(1)
  if (!media) {
    throw new Error("A clip's media file no longer exists")
  }
  if (media.fileType !== "video" && media.fileType !== "audio") {
    throw new Error("Select a video or audio clip first")
  }
  validateJumpCutAnalysisLimits({
    fileSize: media.fileSize,
    durationMs: clip.durationMs,
  })

  const apiKey = await getOpenAiApiKey()
  return withExclusiveJumpCutAnalysis(user.id, async () => {
    const { withApiUsage } = await import("./api-usage.ts")
    return withApiUsage(
      user.id,
      {
        provider: "openai",
        feature: "jump_cut_analysis",
        model: "whisper-1",
      },
      async () => {
        const object = await getFromR2(media.storagePath)
        const bytes = await bodyToBytes(object.Body)
        const audioBytes = await extractWindowAudioWav(
          bytes,
          media.mimeType,
          clip.trimStartMs,
          clip.durationMs
        )
        const words = await transcribeWordsWithOpenAI(apiKey, audioBytes)

        if (mode === "filler") {
          return {
            suggestions: buildFillerWordSuggestions({
              clip,
              words,
              terms: fillerTerms,
            }),
          }
        }

        const silenceRanges = await detectSilenceRanges(
          audioBytes,
          clip.durationMs
        )

        return {
          suggestions: buildJumpCutSuggestions({
            clip,
            sensitivity: data.sensitivity,
            words,
            silenceRanges,
          }),
        }
      }
    )
  })
}

export function validateJumpCutAnalysisLimits({
  fileSize,
  durationMs,
}: {
  fileSize: number
  durationMs: number
}) {
  if (fileSize > JUMP_CUT_MAX_MEDIA_BYTES) {
    throw new Error("Clip is too large for jump-cut analysis")
  }
  if (durationMs > JUMP_CUT_MAX_WINDOW_MS) {
    throw new Error("Select a shorter clip for jump-cut analysis")
  }
}

export async function withExclusiveJumpCutAnalysis<T>(
  userId: string,
  run: () => Promise<T>
) {
  if (activeJumpCutAnalyses.has(userId)) {
    throw new Error("Another jump-cut analysis is already in progress.")
  }

  activeJumpCutAnalyses.add(userId)
  try {
    return await run()
  } finally {
    activeJumpCutAnalyses.delete(userId)
  }
}

export function parseSilencedetectOutput(output: string): JumpCutRange[] {
  const ranges: JumpCutRange[] = []
  let startMs: number | null = null
  for (const line of output.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/)
    if (startMatch) {
      startMs = Math.round(Number(startMatch[1]) * 1000)
      continue
    }

    const endMatch = line.match(/silence_end:\s*([0-9.]+)/)
    if (endMatch && startMs !== null) {
      const endMs = Math.round(Number(endMatch[1]) * 1000)
      if (endMs > startMs) ranges.push({ startMs, endMs })
      startMs = null
    }
  }
  return ranges
}

export function findSpeechGapRanges(
  words: JumpCutWord[],
  minGapMs: number
): JumpCutRange[] {
  const sorted = words
    .filter((word) => word.endMs > word.startMs)
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
  const ranges: JumpCutRange[] = []
  let previousEndMs: number | null = null
  for (const word of sorted) {
    if (previousEndMs !== null && word.startMs - previousEndMs >= minGapMs) {
      ranges.push({ startMs: previousEndMs, endMs: word.startMs })
    }
    previousEndMs =
      previousEndMs === null ? word.endMs : Math.max(previousEndMs, word.endMs)
  }
  return ranges
}

export function buildJumpCutSuggestions({
  clip,
  sensitivity,
  words,
  silenceRanges,
}: {
  clip: Pick<EditorClip, "startMs" | "durationMs" | "trimStartMs">
  sensitivity: JumpCutSensitivity
  words: JumpCutWord[]
  silenceRanges: JumpCutRange[]
}): JumpCutSuggestion[] {
  const config = SENSITIVITY_CONFIG[sensitivity]
  const candidates: JumpCutCandidate[] = [
    ...findSpeechGapRanges(words, config.minGapMs).map((range) => ({
      ...range,
      speech: true,
      silence: false,
    })),
    ...silenceRanges
      .filter((range) => range.endMs - range.startMs >= config.minGapMs)
      .map((range) => ({
        ...range,
        speech: false,
        silence: true,
      })),
  ]
    .map((range) => ({
      ...range,
      startMs: Math.max(0, range.startMs + config.paddingMs),
      endMs: Math.min(clip.durationMs, range.endMs - config.paddingMs),
    }))
    .filter((range) => range.endMs - range.startMs >= MIN_REMOVAL_MS)

  return absorbSmallKeptSegments(mergeCandidates(candidates), clip.durationMs)
    .filter((range) => range.endMs - range.startMs >= MIN_REMOVAL_MS)
    .map((range, index) => ({
      id: `jump-cut-${index + 1}`,
      sourceStartMs: clip.trimStartMs + range.startMs,
      sourceEndMs: clip.trimStartMs + range.endMs,
      clipStartMs: range.startMs,
      clipEndMs: range.endMs,
      timelineStartMs: clip.startMs + range.startMs,
      timelineEndMs: clip.startMs + range.endMs,
      reason: reasonForCandidate(range),
      confidence: confidenceForCandidate(range),
      removedDurationMs: range.endMs - range.startMs,
    }))
}

// One reviewable cut per detected filler occurrence. Words arrive clip-window
// relative (0 = start of the trimmed clip), so their times map straight onto
// the removal spans the APPLY_JUMP_CUTS reducer expects. Occurrences shorter
// than a keepable clip are dropped so the review list only shows cuts that
// actually apply.
export function buildFillerWordSuggestions({
  clip,
  words,
  terms,
}: {
  clip: Pick<EditorClip, "startMs" | "durationMs" | "trimStartMs">
  words: JumpCutWord[]
  terms: string[]
}): JumpCutSuggestion[] {
  return detectFillerRanges(words, terms)
    .map((range) => ({
      ...range,
      startMs: Math.max(0, Math.min(range.startMs, clip.durationMs)),
      endMs: Math.max(0, Math.min(range.endMs, clip.durationMs)),
    }))
    .filter((range) => range.endMs - range.startMs >= MIN_CLIP_MS)
    .map((range, index) => ({
      id: `filler-cut-${index + 1}`,
      sourceStartMs: clip.trimStartMs + range.startMs,
      sourceEndMs: clip.trimStartMs + range.endMs,
      clipStartMs: range.startMs,
      clipEndMs: range.endMs,
      timelineStartMs: clip.startMs + range.startMs,
      timelineEndMs: clip.startMs + range.endMs,
      reason: `Filler: “${range.term}”`,
      confidence: range.confidence,
      removedDurationMs: range.endMs - range.startMs,
    }))
}

function mergeCandidates(candidates: JumpCutCandidate[]) {
  const sorted = candidates
    .filter((range) => range.endMs > range.startMs)
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
  const merged: JumpCutCandidate[] = []
  for (const candidate of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && candidate.startMs <= previous.endMs + MERGE_GAP_MS) {
      previous.endMs = Math.max(previous.endMs, candidate.endMs)
      previous.speech ||= candidate.speech
      previous.silence ||= candidate.silence
    } else {
      merged.push({ ...candidate })
    }
  }
  return merged
}

function absorbSmallKeptSegments(
  ranges: JumpCutCandidate[],
  durationMs: number
) {
  const adjusted = ranges.map((range) => ({ ...range }))
  for (let index = 0; index < adjusted.length; index += 1) {
    const range = adjusted[index]
    const previousEndMs = index === 0 ? 0 : adjusted[index - 1].endMs
    const nextStartMs =
      index === adjusted.length - 1 ? durationMs : adjusted[index + 1].startMs
    if (
      range.startMs - previousEndMs > 0 &&
      range.startMs - previousEndMs < MIN_CLIP_MS
    ) {
      range.startMs = previousEndMs
    }
    if (
      nextStartMs - range.endMs > 0 &&
      nextStartMs - range.endMs < MIN_CLIP_MS
    ) {
      range.endMs = nextStartMs
    }
  }
  return mergeCandidates(adjusted)
}

function reasonForCandidate(candidate: JumpCutCandidate) {
  if (candidate.silence && candidate.speech) return "Silence and speech pause"
  if (candidate.silence) return "Silence"
  return "Speech pause"
}

function confidenceForCandidate(
  candidate: JumpCutCandidate
): JumpCutConfidence {
  if (candidate.silence && candidate.speech) return "high"
  if (candidate.silence) return "medium"
  return "low"
}

function findTimelineClip(timeline: ProjectTimeline, clipId: string) {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return clip
  }
  return null
}

function isJumpCutClip(clip: EditorClip) {
  return clip.kind === "video" || clip.kind === "audio"
}

async function getOpenAiApiKey() {
  const { getLlmKey } = await import("./llm-keys.ts")
  const apiKey = await getLlmKey("openai")
  if (!apiKey) {
    throw new Error("OpenAI key is not configured")
  }
  return apiKey
}

async function transcribeWordsWithOpenAI(
  apiKey: string,
  bytes: Uint8Array
): Promise<JumpCutWord[]> {
  const form = new FormData()
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "audio.wav")
  form.append("model", "whisper-1")
  form.append("response_format", "verbose_json")
  form.append("timestamp_granularities[]", "word")

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    console.error(
      "OpenAI jump-cut transcription failed",
      response.status,
      detail.slice(0, 500)
    )
    throw new Error("Jump-cut analysis failed")
  }

  const payload = (await response.json()) as {
    words?: { word: string; start: number; end: number }[]
  }
  return (payload.words ?? [])
    .map((word) => ({
      text: word.word.trim(),
      startMs: Math.max(0, Math.round(word.start * 1000)),
      endMs: Math.max(0, Math.round(word.end * 1000)),
    }))
    .filter((word) => word.text && word.endMs > word.startMs)
}

async function extractWindowAudioWav(
  bytes: Uint8Array,
  mimeType: string,
  startMs: number,
  durationMs: number
) {
  const dir = await mkdtemp(path.join(tmpdir(), "jump-cut-"))
  const inputPath = path.join(
    dir,
    `input.${mediaExtensionForMimeType(mimeType)}`
  )
  const outputPath = path.join(dir, "audio.wav")
  try {
    await writeFile(inputPath, bytes)
    await runFfmpeg([
      "-ss",
      secondsArg(startMs),
      "-t",
      secondsArg(durationMs),
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ])
    return new Uint8Array(await readFile(outputPath))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function detectSilenceRanges(bytes: Uint8Array, durationMs: number) {
  const dir = await mkdtemp(path.join(tmpdir(), "jump-silence-"))
  const inputPath = path.join(dir, "audio.wav")
  try {
    await writeFile(inputPath, bytes)
    const stderr = await runFfmpeg([
      "-i",
      inputPath,
      "-af",
      "silencedetect=n=-35dB:d=0.25",
      "-f",
      "null",
      "-",
    ])
    return parseSilencedetectOutput(stderr)
      .map((range) => ({
        startMs: Math.max(0, Math.min(range.startMs, durationMs)),
        endMs: Math.max(0, Math.min(range.endMs, durationMs)),
      }))
      .filter((range) => range.endMs > range.startMs)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function secondsArg(ms: number) {
  return (Math.max(0, ms) / 1000).toFixed(3)
}

function runFfmpeg(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], {
      timeout: FFMPEG_TIMEOUT_MS,
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", () => reject(new Error("Jump-cut analysis failed")))
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr)
      } else {
        reject(new Error("Jump-cut analysis failed"))
      }
    })
  })
}
