import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import type { FillerWord } from "@/lib/video/filler-words"
import { sanitizeFillerTerms } from "@/lib/video/filler-words"
import {
  buildFillerWordSuggestions,
  buildJumpCutSuggestions,
  JUMP_CUT_BUSY_MESSAGE,
  JUMP_CUT_FAILED_MESSAGE,
  JUMP_CUT_MAX_MEDIA_BYTES,
  JUMP_CUT_MAX_WINDOW_MS,
  JUMP_CUT_NO_CLIP_MESSAGE,
  JUMP_CUT_TOO_BIG_MESSAGE,
  JUMP_CUT_TOO_LONG_MESSAGE,
  parseSilencedetectOutput,
  type JumpCutMode,
  type JumpCutRange,
  type JumpCutSensitivity,
  type JumpCutSuggestion,
} from "@/lib/video/jump-cuts"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { MIN_CLIP_MS } from "@/lib/video/timeline-utils"
import type { EditorClip } from "@/components/video-editor/editor-store"
import { pickTranscriber } from "@/lib/video/ai-choices"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import {
  generateJson,
  requireGeminiKey,
  withGeminiFile,
} from "@/server/video/gemini"
import { videoProjects } from "@/server/video/schema"
import { getAiDefaults } from "@/server/video/settings"
import {
  requireOpenAiKey,
  transcribeWithWhisper,
} from "@/server/video/whisper"
import { downloadToFile } from "@/server/video/storage-files"

/**
 * Looking through a clip for what could come out of it.
 *
 * Dead air is found by listening to the sound itself — ffmpeg reports every
 * stretch below a whisper — so it costs nothing and needs no key. Filler words
 * need to know what was said and when, which means a transcript, which means a
 * provider.
 *
 * Nothing is changed here. This only ever hands back a list of suggestions;
 * cutting is the editor's job, and one press of undo puts it all back.
 */

const WORDS_MODEL = "gemini-2.5-flash"
const WORDS_LABEL = "Filler words"

/** Below this, for at least this long, counts as quiet. */
const SILENCE_DB = -35
const SILENCE_MIN_SECONDS = 0.25

/**
 * One clip at a time per person. Looking through a clip is minutes of work on
 * a machine; letting somebody start ten at once helps nobody.
 */
const busyWith = new Set<string>()

const wordsSchema = z.object({
  words: z
    .array(
      z.object({
        text: z.string().max(80),
        startMs: z.number().finite(),
        endMs: z.number().finite(),
      })
    )
    .max(5000),
})

function wordsPrompt(durationMs: number) {
  return `Write down every word spoken in this sound, with when it was said.

The sound is ${durationMs} milliseconds long. Every time must be a whole number of milliseconds between 0 and ${durationMs}, measured from the start of the sound.

Answer with JSON only, in exactly this shape, and nothing else:
{ "words": [{ "text": "hello", "startMs": 0, "endMs": 320 }] }

Rules:
- One entry per spoken word, in the order they were said.
- Include hesitations exactly as they sound: "um", "uh", "er".
- Keep the word as spoken, without punctuation.
- If nobody speaks, answer { "words": [] }.`
}

export type ClipTranscript = {
  clipId: string
  words: FillerWord[]
  /**
   * The quiet stretches, measured by listening. Cutting a run of words uses
   * these to land on the real edges of the speech rather than on an estimate.
   */
  silences: JumpCutRange[]
  /** The clip as it stood when the words were written down. */
  source: {
    clipId: string
    trackId: string
    kind: "video" | "audio"
    mediaId: string
    startMs: number
    durationMs: number
    trimStartMs: number
  }
}

export type JumpCutAnalysis = {
  suggestions: JumpCutSuggestion[]
  /** What the clip is, so the editor can apply the cuts to the right one. */
  clipId: string
}

/**
 * Suggestions for one clip of the caller's own project.
 */
export async function analyseJumpCuts({
  userId,
  projectId,
  clipId,
  mode,
  sensitivity,
  fillerTerms,
}: {
  userId: string
  projectId: string
  clipId: string
  mode: JumpCutMode
  sensitivity: JumpCutSensitivity
  fillerTerms?: string[]
}): Promise<JumpCutAnalysis> {
  if (busyWith.has(userId)) throw new Error(JUMP_CUT_BUSY_MESSAGE)
  busyWith.add(userId)
  try {
    return await run({
      userId,
      projectId,
      clipId,
      mode,
      sensitivity,
      fillerTerms,
    })
  } finally {
    busyWith.delete(userId)
  }
}

async function run({
  userId,
  projectId,
  clipId,
  mode,
  sensitivity,
  fillerTerms,
}: {
  userId: string
  projectId: string
  clipId: string
  mode: JumpCutMode
  sensitivity: JumpCutSensitivity
  fillerTerms?: string[]
}): Promise<JumpCutAnalysis> {
  const terms = sanitizeFillerTerms(fillerTerms)
  if (mode === "filler" && !terms.length) return { suggestions: [], clipId }

  const { clip, media } = await findClipAndMedia({ userId, projectId, clipId })
  // Too short to take anything out of and still have two pieces left.
  if (clip.durationMs < MIN_CLIP_MS * 2) return { suggestions: [], clipId }

  const window = {
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    trimStartMs: clip.trimStartMs,
  }

  const dir = await mkdtemp(path.join(tmpdir(), "video-jump-cuts-"))
  try {
    const wav = await extractClipAudio(dir, media.storagePath, clip)

    // Listening is quick and free, and it is what makes a cut land in the
    // right place: the times a word was said are an estimate, the quiet is
    // measured.
    const noise = await runFfmpeg(
      [
        "-i",
        wav,
        "-af",
        `silencedetect=n=${SILENCE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
        "-f",
        "null",
        "-",
      ],
      JUMP_CUT_FAILED_MESSAGE
    )
    const silenceRanges = parseSilencedetectOutput(noise)

    if (mode === "filler") {
      const words = await transcribeWords(
        userId,
        projectId,
        await readFile(wav),
        Math.round(clip.durationMs)
      )
      return {
        clipId,
        suggestions: buildFillerWordSuggestions({
          clip: window,
          words,
          terms,
          silenceRanges,
        }),
      }
    }

    return {
      clipId,
      suggestions: buildJumpCutSuggestions({
        clip: window,
        sensitivity,
        // Dead air is heard, not read: no transcript is fetched for it, so
        // there are no word gaps to add to what the silence already found.
        words: [],
        silenceRanges,
      }),
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * The words spoken at the very start of a clip.
 *
 * Only the opening is listened to: an opening line is a few seconds, and
 * sending a whole take to be written down to read its first sentence would be
 * slow and dear for no reason.
 */
export async function transcribeOpening({
  userId,
  projectId,
  clipId,
  windowMs,
}: {
  userId: string
  projectId: string
  clipId: string
  windowMs: number
}): Promise<FillerWord[]> {
  const { clip, media } = await findClipAndMedia({ userId, projectId, clipId })
  const opening = {
    ...clip,
    durationMs: Math.min(clip.durationMs, windowMs),
  }
  const dir = await mkdtemp(path.join(tmpdir(), "video-hook-"))
  try {
    const wav = await extractClipAudio(dir, media.storagePath, opening)
    return await transcribeWords(
      userId,
      projectId,
      await readFile(wav),
      Math.round(opening.durationMs)
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Every word of one clip, with when it was said — what the transcript panel
 * lists and what crossing words out is measured against.
 */
export async function transcribeClip({
  userId,
  projectId,
  clipId,
}: {
  userId: string
  projectId: string
  clipId: string
}): Promise<ClipTranscript> {
  if (busyWith.has(userId)) throw new Error(JUMP_CUT_BUSY_MESSAGE)
  busyWith.add(userId)
  try {
    const { clip, trackId, media } = await findClipAndMedia({
      userId,
      projectId,
      clipId,
    })
    const dir = await mkdtemp(path.join(tmpdir(), "video-transcript-"))
    try {
      const wav = await extractClipAudio(dir, media.storagePath, clip)
      const noise = await runFfmpeg(
        [
          "-i",
          wav,
          "-af",
          `silencedetect=n=${SILENCE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
          "-f",
          "null",
          "-",
        ],
        JUMP_CUT_FAILED_MESSAGE
      )
      const words = await transcribeWords(
        userId,
        projectId,
        await readFile(wav),
        Math.round(clip.durationMs)
      )
      return {
        clipId,
        words,
        silences: parseSilencedetectOutput(noise),
        source: {
          clipId: clip.id,
          trackId,
          kind: clip.kind as "video" | "audio",
          mediaId: clip.mediaId as string,
          startMs: clip.startMs,
          durationMs: clip.durationMs,
          trimStartMs: clip.trimStartMs,
        },
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  } finally {
    busyWith.delete(userId)
  }
}

/**
 * What was said and when, as one charge on the person's own budget.
 *
 * Whichever AI has been chosen for the job does it — Whisper measures the
 * times, Gemini estimates them — and the answer is the same shape either way.
 */
async function transcribeWords(
  userId: string,
  projectId: string,
  audio: Uint8Array,
  durationMs: number
): Promise<FillerWord[]> {
  const chosen = pickTranscriber(await getAiDefaults(), {
    words: !!(await getAiKey("gemini")),
    openai: !!(await getAiKey("openai")),
  })
  if (chosen?.id === "openai") {
    const apiKey = await requireOpenAiKey()
    return runAiCall(
      {
        userId,
        provider: "openai",
        model: chosen.model,
        feature: "jump_cut_analysis",
        metadata: { projectId },
      },
      async () => {
        const answer = await transcribeWithWhisper({
          apiKey,
          audio,
          label: WORDS_LABEL,
        })
        return {
          result: answer.words.map((word) => ({
            text: word.text,
            startMs: Math.max(0, word.startMs),
            endMs: Math.min(durationMs, word.endMs),
          })),
          // Whisper is charged by the minute of sound, not by tokens.
          usage: { inputTokens: 0, outputTokens: 0, units: durationMs / 60_000 },
        }
      }
    )
  }

  const apiKey = await requireGeminiKey()
  return runAiCall(
    {
      userId,
      provider: "gemini",
      model: WORDS_MODEL,
      feature: "jump_cut_analysis",
      metadata: { projectId },
    },
    async () => {
      const answer = await withGeminiFile(
        audio,
        "audio/wav",
        apiKey,
        WORDS_LABEL,
        (sound) =>
          generateJson({
            apiKey,
            model: WORDS_MODEL,
            parts: [sound, { text: wordsPrompt(durationMs) }],
            schema: wordsSchema,
            label: WORDS_LABEL,
          })
      )
      return {
        result: answer.value.words.map((word) => ({
          text: word.text,
          startMs: Math.max(0, Math.round(word.startMs)),
          endMs: Math.min(durationMs, Math.round(word.endMs)),
        })),
        usage: {
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
        },
      }
    }
  )
}

/**
 * The clip, the lane it is on, and the file behind it — all looked up as this
 * person's own, so a hand-edited timeline cannot reach anybody else's
 * recording.
 */
async function findClipAndMedia({
  userId,
  projectId,
  clipId,
}: {
  userId: string
  projectId: string
  clipId: string
}) {
  const [project] = await db
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)

  const timeline = requireCanonicalTimeline(project.timeline)
  const found = findClipOnTrack(timeline.tracks, clipId)
  if (
    !found?.clip.mediaId ||
    (found.clip.kind !== "video" && found.clip.kind !== "audio")
  ) {
    throw new Error(JUMP_CUT_NO_CLIP_MESSAGE)
  }
  if (found.clip.durationMs > JUMP_CUT_MAX_WINDOW_MS) {
    throw new Error(JUMP_CUT_TOO_LONG_MESSAGE)
  }

  const [media] = await db
    .select()
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.id, found.clip.mediaId),
        eq(customShellMedia.userId, userId)
      )
    )
    .limit(1)
  if (!media) throw new Error(JUMP_CUT_NO_CLIP_MESSAGE)
  if (media.fileSize && media.fileSize > JUMP_CUT_MAX_MEDIA_BYTES) {
    throw new Error(JUMP_CUT_TOO_BIG_MESSAGE)
  }
  return { clip: found.clip, trackId: found.trackId, media }
}

/**
 * Just the stretch of sound this clip actually uses, small and mono — the
 * shape both listening and transcribing want.
 */
async function extractClipAudio(
  dir: string,
  storagePath: string,
  clip: EditorClip
) {
  const source = path.join(dir, "source")
  await downloadToFile(storagePath, source)
  const size = await stat(source)
  if (size.size > JUMP_CUT_MAX_MEDIA_BYTES) {
    throw new Error(JUMP_CUT_TOO_BIG_MESSAGE)
  }

  const wav = path.join(dir, "audio.wav")
  await runFfmpeg(
    [
      "-ss",
      String(clip.trimStartMs / 1000),
      "-t",
      String(clip.durationMs / 1000),
      "-i",
      source,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      wav,
    ],
    JUMP_CUT_FAILED_MESSAGE
  )
  return wav
}

function findClipOnTrack(
  tracks: { id: string; clips: EditorClip[] }[],
  clipId: string
) {
  for (const track of tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return { clip, trackId: track.id }
  }
  return null
}

