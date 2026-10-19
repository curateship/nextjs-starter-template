import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { and, eq } from "drizzle-orm"

import {
  clipMsAt,
  clipSpeed,
  sourceEndMs,
  sourceSpanMs,
} from "@/lib/video/clip-playback"
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
import { wordsInStretch, type FileWord } from "@/lib/video/transcripts"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { requireGeminiKey } from "@/server/video/gemini"
import { videoProjects } from "@/server/video/schema"
import { getAiDefaults } from "@/server/video/settings"
import { downloadToFile } from "@/server/video/storage-files"
import {
  fileWords,
  readSavedTranscript,
  transcribeSound,
} from "@/server/video/transcripts"

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

const WORDS_LABEL = "Filler words"

/** Below this, for at least this long, counts as quiet. */
const SILENCE_DB = -35
const SILENCE_MIN_SECONDS = 0.25

/**
 * One clip at a time per person. Looking through a clip is minutes of work on
 * a machine; letting somebody start ten at once helps nobody.
 */
const busyWith = new Set<string>()

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
    speed?: number
  }
}

/**
 * The sound that was listened to runs at the recording's own pace, whatever
 * speed the clip plays it at. A clip at 2x reaches each of those moments half
 * as far along itself, so every time is squeezed into clip time here, once,
 * and everything downstream works in the clip's own milliseconds.
 */
function toClipTimes<T extends { startMs: number; endMs: number }>(
  ranges: T[],
  clip: { speed?: number }
): T[] {
  const speed = clipSpeed(clip)
  if (speed === 1) return ranges
  return ranges.map((range) => ({
    ...range,
    startMs: range.startMs / speed,
    endMs: range.endMs / speed,
  }))
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
    const { source, wav } = await extractClipAudio(dir, media.storagePath, clip)

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
    const silenceRanges = toClipTimes(parseSilencedetectOutput(noise), clip)

    if (mode === "filler") {
      // The file's saved words when there are some, or the whole file written
      // down and saved now. Only the clip's own stretch is used here.
      const words = inClipTime(
        await wordsOfFile({
          userId,
          projectId,
          media,
          localSource: source,
        }),
        clip
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
  // A file already written down has its opening in the saved words, for
  // nothing. Otherwise only the opening is sent, and not saved, because a
  // few seconds of a file is not the file.
  const transcriber = pickTranscriber(
    await getAiDefaults(),
    await getAiKeysSaved()
  )
  const saved = transcriber
    ? await readSavedTranscript(userId, media.id, transcriber.id)
    : null
  if (saved) {
    return wordsInStretch(
      saved.words,
      opening.trimStartMs,
      sourceEndMs(opening)
    ).map((word) => ({
      text: word.text,
      startMs: word.startMs - opening.trimStartMs,
      endMs: word.endMs - opening.trimStartMs,
    }))
  }
  if (!transcriber) {
    await requireGeminiKey()
    throw new Error(JUMP_CUT_FAILED_MESSAGE)
  }
  const dir = await mkdtemp(path.join(tmpdir(), "video-hook-"))
  try {
    const { wav } = await extractClipAudio(dir, media.storagePath, opening)
    return await transcribeSound({
      userId,
      projectId,
      transcriber,
      feature: "jump_cut_analysis",
      label: WORDS_LABEL,
      audio: await readFile(wav),
      // The sound runs at the recording's own pace, whatever the clip's speed.
      durationMs: Math.round(sourceSpanMs(opening)),
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Every word of one clip, with when it was said — what the transcript panel
 * lists and what crossing words out is measured against.
 *
 * The words come from the file's saved transcript, so opening the panel on a
 * clip a second time, or on another clip of the same file, costs nothing.
 * `fresh` is "Transcribe again": it pays for the whole file once more and
 * replaces what was saved.
 */
export async function transcribeClip({
  userId,
  projectId,
  clipId,
  fresh = false,
}: {
  userId: string
  projectId: string
  clipId: string
  fresh?: boolean
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
      const { source, wav } = await extractClipAudio(
        dir,
        media.storagePath,
        clip
      )
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
      const words = await wordsOfFile({
        userId,
        projectId,
        media,
        localSource: source,
        fresh,
      })
      return {
        clipId,
        // Along the timeline, which is where the panel places each word.
        words: inClipTime(words, clip).map((word) => ({
          ...word,
          startMs: clip.startMs + word.startMs,
          endMs: clip.startMs + word.endMs,
        })),
        silences: toClipTimes(parseSilencedetectOutput(noise), clip),
        source: {
          clipId: clip.id,
          trackId,
          kind: clip.kind as "video" | "audio",
          mediaId: clip.mediaId as string,
          startMs: clip.startMs,
          durationMs: clip.durationMs,
          trimStartMs: clip.trimStartMs,
          speed: clip.speed,
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
 * Every word of the clip's file, saved or written down now with whichever AI
 * is chosen. With no key for either, the Gemini key is the one asked for.
 */
async function wordsOfFile({
  userId,
  projectId,
  media,
  localSource,
  fresh,
}: {
  userId: string
  projectId: string
  media: { id: string; storagePath: string }
  localSource: string
  fresh?: boolean
}): Promise<FileWord[]> {
  const transcriber = pickTranscriber(
    await getAiDefaults(),
    await getAiKeysSaved()
  )
  if (!transcriber) {
    await requireGeminiKey()
    throw new Error(JUMP_CUT_FAILED_MESSAGE)
  }
  return fileWords({
    userId,
    media,
    transcriber,
    feature: "jump_cut_analysis",
    label: WORDS_LABEL,
    projectId,
    tooLongMessage: JUMP_CUT_TOO_LONG_MESSAGE,
    failedMessage: JUMP_CUT_FAILED_MESSAGE,
    fresh,
    localSource,
  })
}

/**
 * The words of a file that the clip plays, moved into the clip's own time:
 * 0 is the clip's first frame, and a clip at 2x reaches each word in half
 * the time it sits into the file.
 */
function inClipTime(words: FileWord[], clip: EditorClip): FillerWord[] {
  return wordsInStretch(words, clip.trimStartMs, sourceEndMs(clip)).map(
    (word) => ({
      text: word.text,
      startMs: clipMsAt(clip, word.startMs),
      endMs: clipMsAt(clip, word.endMs),
    })
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
  // Measured against the recording, not the room the clip takes. A clip at 4x
  // holds four times its own length of sound, and it is the sound that is
  // extracted, listened to and paid to have written down.
  if (sourceSpanMs(found.clip) > JUMP_CUT_MAX_WINDOW_MS) {
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
 * Just the stretch of sound this clip actually uses, small and mono, the
 * shape listening wants. The downloaded file comes back too, for writing the
 * whole file down without fetching it again.
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
      String(sourceSpanMs(clip) / 1000),
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
  return { source, wav }
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
