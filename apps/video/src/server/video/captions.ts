import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  CAPTIONS_FAILED_MESSAGE,
  CAPTIONS_MAX_SOURCE_MS,
  CAPTIONS_NONE_HEARD_MESSAGE,
  CAPTIONS_NOT_POSSIBLE_MESSAGE,
  CAPTIONS_TOO_LONG_MESSAGE,
  CAPTION_MAX_MS,
  CAPTION_MAX_WORDS,
  mapCaptionsToTimeline,
  type CaptionsResult,
} from "@/lib/video/captions"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import type { EditorClip } from "@/components/video-editor/editor-store"
import { pickTranscriber } from "@/lib/video/ai-choices"
import { wordsToCaptions } from "@/lib/video/voice"
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
 * Writing the captions.
 *
 * The sound of the project's main talking clip is pulled out, sent off to be
 * transcribed, and comes back as short lines with times against the timeline.
 * Turning those into clips is the editor's job, so this can be checked on its
 * own and so the whole insertion is one thing to undo.
 *
 * Only the sound is sent, never the picture: it is a fraction of the size, and
 * the times come back tighter for it.
 */

const CAPTIONS_MODEL = "gemini-2.5-flash"
const CAPTIONS_LABEL = "Captions"

/** What comes back. Anything longer than this is not a caption. */
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

function captionsPrompt(durationMs: number) {
  return `You are writing subtitles for a short social video.

The sound is ${durationMs} milliseconds long. Every time you give must be a whole number of milliseconds between 0 and ${durationMs}, measured from the start of the sound.

Answer with JSON only, in exactly this shape, and nothing else:
{ "captions": [{ "startMs": 0, "endMs": 900, "text": "..." }] }

Rules:
- Write down only what is spoken. Ignore music, sound effects and any words shown on screen.
- Break the speech into chunks of at most ${CAPTION_MAX_WORDS} words, each lasting at most ${CAPTION_MAX_MS} milliseconds.
- Follow the real timing of the speech. Chunks must never overlap.
- Keep the language and the capitalisation as spoken.
- If nobody speaks, answer { "captions": [] }.`
}

/**
 * Which clip gets captioned: the longest piece of sound on a lane that is not
 * muted, and failing that the longest piece of video on one. That is almost
 * always the talking, and picking it automatically saves an extra question.
 */
function findCaptionSource(tracks: { id: string; muted: boolean; clips: EditorClip[] }[]) {
  let bestAudio: { clip: EditorClip; trackId: string } | null = null
  let bestVideo: { clip: EditorClip; trackId: string } | null = null
  for (const track of tracks) {
    if (track.muted) continue
    for (const clip of track.clips ?? []) {
      if (!clip.mediaId || !clip.durationMs) continue
      if (clip.kind === "audio") {
        if (!bestAudio || clip.durationMs > bestAudio.clip.durationMs) {
          bestAudio = { clip, trackId: track.id }
        }
      } else if (clip.kind === "video") {
        if (!bestVideo || clip.durationMs > bestVideo.clip.durationMs) {
          bestVideo = { clip, trackId: track.id }
        }
      }
    }
  }
  return bestAudio ?? bestVideo
}

/**
 * The sound of one file, as a small mono WAV — the shape transcription likes
 * and a fraction of the size of the original.
 */
async function extractAudio(storagePath: string): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-captions-"))
  try {
    const source = path.join(dir, "source")
    const wav = path.join(dir, "audio.wav")
    await downloadToFile(storagePath, source)
    await runFfmpeg(
      ["-i", source, "-vn", "-ac", "1", "-ar", "16000", wav],
      CAPTIONS_FAILED_MESSAGE
    )
    return await readFile(wav)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Captions for one project of the caller's own.
 *
 * The whole thing is one call on the meter: sending the sound, waiting, and
 * reading the answer are one press of one button, and a failure charges
 * nothing.
 */
export async function writeProjectCaptions(
  userId: string,
  projectId: string
): Promise<CaptionsResult> {
  const [project] = await db
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)

  const timeline = requireCanonicalTimeline(project.timeline)
  const chosen = findCaptionSource(timeline.tracks)
  if (!chosen?.clip.mediaId) throw new Error(CAPTIONS_NOT_POSSIBLE_MESSAGE)
  if (chosen.clip.durationMs > CAPTIONS_MAX_SOURCE_MS) {
    throw new Error(CAPTIONS_TOO_LONG_MESSAGE)
  }

  // The file is looked up as this person's own, so a hand-edited timeline
  // cannot pull somebody else's recording into a transcript.
  const [media] = await db
    .select()
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.id, chosen.clip.mediaId),
        eq(customShellMedia.userId, userId)
      )
    )
    .limit(1)
  if (!media) throw new Error(CAPTIONS_NOT_POSSIBLE_MESSAGE)

  const audio = await extractAudio(media.storagePath)
  const soundMs = Math.round(chosen.clip.durationMs)

  const source = {
    clipId: chosen.clip.id,
    trackId: chosen.trackId,
    kind: chosen.clip.kind as "video" | "audio",
    mediaId: chosen.clip.mediaId,
    startMs: chosen.clip.startMs,
    durationMs: chosen.clip.durationMs,
    trimStartMs: chosen.clip.trimStartMs,
  }

  // Whichever AI has been chosen writes it down. Whisper hands back words with
  // measured times, which are chunked into lines here; Gemini is asked for the
  // lines directly, because that is what it is good at.
  const transcriber = pickTranscriber(await getAiDefaults(), {
    words: !!(await getAiKey("gemini")),
    openai: !!(await getAiKey("openai")),
  })
  if (transcriber?.id === "openai") {
    const apiKey = await requireOpenAiKey()
    const lines = await runAiCall(
      {
        userId,
        provider: "openai",
        model: transcriber.model,
        feature: "caption_generation",
        metadata: { projectId },
      },
      async () => {
        const answer = await transcribeWithWhisper({
          apiKey,
          audio,
          label: CAPTIONS_LABEL,
        })
        return {
          result: wordsToCaptions(answer.words),
          // Charged by the minute of sound, not by tokens.
          usage: { inputTokens: 0, outputTokens: 0, units: soundMs / 60_000 },
        }
      }
    )
    const captions = mapCaptionsToTimeline(lines, source)
    if (!captions.length) throw new Error(CAPTIONS_NONE_HEARD_MESSAGE)
    return { captions, source }
  }

  const apiKey = await requireGeminiKey()

  const answer = await runAiCall(
    {
      userId,
      provider: "gemini",
      model: CAPTIONS_MODEL,
      feature: "caption_generation",
      metadata: { projectId },
    },
    async () => {
      const result = await withGeminiFile(
        audio,
        "audio/wav",
        apiKey,
        CAPTIONS_LABEL,
        (sound) =>
          generateJson({
            apiKey,
            model: CAPTIONS_MODEL,
            parts: [sound, { text: captionsPrompt(soundMs) }],
            schema: captionsSchema,
            label: CAPTIONS_LABEL,
          })
      )
      return {
        result: result.value.captions,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      }
    }
  )

  const captions = mapCaptionsToTimeline(answer, source)
  if (!captions.length) throw new Error(CAPTIONS_NONE_HEARD_MESSAGE)
  return { captions, source }
}

