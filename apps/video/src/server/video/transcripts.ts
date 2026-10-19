import { mkdtemp, open, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { TRANSCRIBERS, TranscriberId } from "@/lib/video/ai-choices"
import {
  joinTranscriptPieces,
  planTranscriptPieces,
  TRANSCRIBE_MAX_SOURCE_MS,
  transcribersServing,
  type FileWord,
  type SavedTranscriptSummary,
} from "@/lib/video/transcripts"
import { runAiCall } from "@/server/ai/usage"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import {
  generateJson,
  requireGeminiKey,
  withGeminiFile,
} from "@/server/video/gemini"
import { videoMediaTranscripts } from "@/server/video/schema"
import { downloadToFile } from "@/server/video/storage-files"
import {
  requireOpenAiKey,
  transcribeWithWhisper,
} from "@/server/video/whisper"

/**
 * Writing down a whole file once, and reading it back.
 *
 * The first tool that needs a file's words pays for all of them and saves
 * them here, timed from the start of the file. Every later tool, on any clip
 * cut from that file, reads its stretch out of the saved words for nothing.
 * The Words panel's "Transcribe again" is the one way to pay again.
 *
 * Long sound goes in pieces of up to ten minutes (`planTranscriptPieces`),
 * sent at once and joined back in order, and the whole file is still one row
 * on the meter: it was one press of one button.
 */

type Transcriber = (typeof TRANSCRIBERS)[number]

/** One piece of Gemini's answer. Ten minutes of talking is about 1,600 words. */
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

/**
 * One prompt for every tool. Captions want the punctuation and the capitals,
 * Tighten wants the "um"s, and the Words panel wants both, so Gemini is asked
 * for all of it and each tool takes what it needs.
 */
export function transcriptPrompt(durationMs: number) {
  return `Write down every word spoken in this sound, with when it was said.

The sound is ${durationMs} milliseconds long. Every time must be a whole number of milliseconds between 0 and ${durationMs}, measured from the start of the sound.

Answer with JSON only, in exactly this shape, and nothing else:
{ "words": [{ "text": "Hello,", "startMs": 0, "endMs": 320 }] }

Rules:
- Write down only what is spoken. Ignore music, sound effects and any words shown on screen.
- One entry per spoken word, in the order they were said.
- Include hesitations exactly as they sound: "um", "uh", "er".
- Keep the language and the capitalisation as spoken, with the punctuation a subtitle would have attached to the word it follows.
- If nobody speaks, answer { "words": [] }.`
}

/**
 * The saved words that may answer a run with this transcriber, as this
 * person's own. The file is joined in so a transcript is only ever read by
 * whoever owns the recording, whatever id a timeline names.
 */
export async function readSavedTranscript(
  userId: string,
  mediaId: string,
  transcriber: TranscriberId
): Promise<{ words: FileWord[]; transcriber: TranscriberId; durationMs: number } | null> {
  const serving = transcribersServing(transcriber)
  const rows = await db
    .select({
      transcriber: videoMediaTranscripts.transcriber,
      words: videoMediaTranscripts.words,
      durationMs: videoMediaTranscripts.durationMs,
    })
    .from(videoMediaTranscripts)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, videoMediaTranscripts.mediaId)
    )
    .where(
      and(
        eq(videoMediaTranscripts.mediaId, mediaId),
        eq(customShellMedia.userId, userId),
        inArray(videoMediaTranscripts.transcriber, serving)
      )
    )
  for (const id of serving) {
    const row = rows.find((one) => one.transcriber === id)
    const words = row ? readWords(row.words) : null
    if (row && words) return { words, transcriber: id, durationMs: row.durationMs }
  }
  return null
}

/** Which of these files have saved words, for the price before the press. */
export async function listSavedTranscripts(
  userId: string,
  mediaIds: string[]
): Promise<SavedTranscriptSummary[]> {
  if (!mediaIds.length) return []
  const rows = await db
    .select({
      mediaId: videoMediaTranscripts.mediaId,
      transcriber: videoMediaTranscripts.transcriber,
      durationMs: videoMediaTranscripts.durationMs,
    })
    .from(videoMediaTranscripts)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, videoMediaTranscripts.mediaId)
    )
    .where(
      and(
        inArray(videoMediaTranscripts.mediaId, mediaIds),
        eq(customShellMedia.userId, userId)
      )
    )
  return rows.flatMap((row) =>
    row.transcriber === "openai" || row.transcriber === "gemini"
      ? [{ ...row, transcriber: row.transcriber }]
      : []
  )
}

const savedWordsSchema = z.array(
  z.object({ text: z.string(), startMs: z.number(), endMs: z.number() })
)

/** A saved row that no longer reads as words is treated as not saved. */
function readWords(value: unknown): FileWord[] | null {
  const parsed = savedWordsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Every word of one file of the caller's own, saved or written down now.
 *
 * `media` must already have been looked up as the caller's own. `localSource`
 * is the file when the caller has already downloaded it, so it is not fetched
 * twice. `fresh` skips the saved words and replaces them, which is what
 * "Transcribe again" pays for.
 */
export async function fileWords({
  userId,
  media,
  transcriber,
  feature,
  label,
  projectId,
  tooLongMessage,
  failedMessage,
  fresh = false,
  localSource,
}: {
  userId: string
  media: { id: string; storagePath: string }
  transcriber: Transcriber
  feature: string
  label: string
  projectId: string
  tooLongMessage: string
  failedMessage: string
  fresh?: boolean
  localSource?: string
}): Promise<FileWord[]> {
  if (!fresh) {
    const saved = await readSavedTranscript(userId, media.id, transcriber.id)
    if (saved) return saved.words
  }

  // The key is asked for before anything is downloaded, so a missing one is
  // said at once rather than after a minute of fetching.
  const apiKey =
    transcriber.id === "openai"
      ? await requireOpenAiKey()
      : await requireGeminiKey()

  const dir = await mkdtemp(path.join(tmpdir(), "video-transcript-file-"))
  try {
    const source = localSource ?? path.join(dir, "source")
    if (!localSource) await downloadToFile(media.storagePath, source)
    const wav = path.join(dir, "sound.wav")
    // Pulled out no further than a second past the limit: enough to tell a
    // file that is too long, without turning hours of sound into a WAV first.
    await runFfmpeg(
      [
        "-i",
        source,
        "-vn",
        "-t",
        String(TRANSCRIBE_MAX_SOURCE_MS / 1000 + 1),
        "-ac",
        "1",
        "-ar",
        "16000",
        wav,
      ],
      failedMessage
    )
    const durationMs = await wavDurationMs(wav)
    if (durationMs === null) throw new Error(failedMessage)
    if (durationMs > TRANSCRIBE_MAX_SOURCE_MS) throw new Error(tooLongMessage)

    const pieces = planTranscriptPieces(durationMs)
    const words = await runAiCall(
      {
        userId,
        provider: transcriber.provider,
        model: transcriber.model,
        feature,
        metadata: { projectId, mediaId: media.id, pieces: pieces.length },
      },
      async () => {
        // All pieces at once: a 25-minute talk is three requests, and one
        // after another they could outlast the page's patience.
        const heard = await Promise.all(
          pieces.map(async (piece, index) => {
            const audio = await cutPiece(dir, wav, piece, index, failedMessage)
            const answer = await transcribePiece({
              transcriber,
              apiKey,
              audio,
              durationMs: piece.durationMs,
              label,
            })
            return { ...piece, ...answer }
          })
        )
        const soundMs = pieces.reduce((sum, piece) => sum + piece.durationMs, 0)
        return {
          result: joinTranscriptPieces(heard),
          usage:
            transcriber.id === "openai"
              ? // Whisper bills the minutes it listens to, overlap included.
                { inputTokens: 0, outputTokens: 0, units: soundMs / 60_000 }
              : {
                  inputTokens: sum(heard.map((one) => one.inputTokens)),
                  outputTokens: sum(heard.map((one) => one.outputTokens)),
                },
        }
      }
    )

    await saveTranscript({
      mediaId: media.id,
      transcriber,
      words,
      durationMs,
    })
    return words
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * A few seconds of sound written down on their own, as one press on the
 * meter, and not saved: a stretch of a file is not the file. Only the Hook
 * tool's spoken opening uses this, for a file nobody has written down yet.
 * `audio` is a 16 kHz mono WAV of `durationMs`, at the recording's own pace.
 */
export async function transcribeSound({
  userId,
  projectId,
  transcriber,
  feature,
  label,
  audio,
  durationMs,
}: {
  userId: string
  projectId: string
  transcriber: Transcriber
  feature: string
  label: string
  audio: Uint8Array
  durationMs: number
}): Promise<FileWord[]> {
  const apiKey =
    transcriber.id === "openai"
      ? await requireOpenAiKey()
      : await requireGeminiKey()
  return runAiCall(
    {
      userId,
      provider: transcriber.provider,
      model: transcriber.model,
      feature,
      metadata: { projectId },
    },
    async () => {
      const answer = await transcribePiece({
        transcriber,
        apiKey,
        audio,
        durationMs,
        label,
      })
      return {
        result: answer.words,
        usage:
          transcriber.id === "openai"
            ? { inputTokens: 0, outputTokens: 0, units: durationMs / 60_000 }
            : {
                inputTokens: answer.inputTokens,
                outputTokens: answer.outputTokens,
              },
      }
    }
  )
}

async function saveTranscript({
  mediaId,
  transcriber,
  words,
  durationMs,
}: {
  mediaId: string
  transcriber: Transcriber
  words: FileWord[]
  durationMs: number
}) {
  const row = {
    mediaId,
    transcriber: transcriber.id,
    model: transcriber.model,
    words,
    durationMs,
    createdAt: new Date(),
  }
  await db
    .insert(videoMediaTranscripts)
    .values(row)
    .onConflictDoUpdate({
      target: [videoMediaTranscripts.mediaId, videoMediaTranscripts.transcriber],
      set: {
        model: row.model,
        words: row.words,
        durationMs: row.durationMs,
        createdAt: row.createdAt,
      },
    })
}

/** One piece of the file's sound, as its own small WAV. */
async function cutPiece(
  dir: string,
  wav: string,
  piece: { startMs: number; durationMs: number },
  index: number,
  failedMessage: string
) {
  const out = path.join(dir, `piece-${index}.wav`)
  await runFfmpeg(
    [
      "-ss",
      String(piece.startMs / 1000),
      "-t",
      String(piece.durationMs / 1000),
      "-i",
      wav,
      "-ac",
      "1",
      "-ar",
      "16000",
      out,
    ],
    failedMessage
  )
  return readFile(out)
}

/**
 * The words of one piece, timed from the start of that piece, and what the
 * provider counted for it.
 */
async function transcribePiece({
  transcriber,
  apiKey,
  audio,
  durationMs,
  label,
}: {
  transcriber: Transcriber
  apiKey: string
  audio: Uint8Array
  durationMs: number
  label: string
}): Promise<{ words: FileWord[]; inputTokens: number; outputTokens: number }> {
  if (transcriber.id === "openai") {
    const answer = await transcribeWithWhisper({ apiKey, audio, label })
    return {
      words: answer.words.map((word) => ({
        text: word.text,
        startMs: Math.max(0, word.startMs),
        endMs: Math.min(durationMs, word.endMs),
      })),
      inputTokens: 0,
      outputTokens: 0,
    }
  }
  const model = transcriber.model
  const answer = await withGeminiFile(audio, "audio/wav", apiKey, label, (sound) =>
    generateJson({
      apiKey,
      model,
      parts: [sound, { text: transcriptPrompt(Math.round(durationMs)) }],
      schema: wordsSchema,
      label,
    })
  )
  return {
    words: answer.value.words.map((word) => ({
      text: word.text,
      startMs: Math.max(0, Math.round(word.startMs)),
      endMs: Math.min(durationMs, Math.round(word.endMs)),
    })),
    inputTokens: answer.inputTokens,
    outputTokens: answer.outputTokens,
  }
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

/**
 * How long a 16 kHz mono WAV plays, read from its header: the size of its
 * `data` chunk over 32,000 bytes a second. Null when there is no such chunk.
 */
export async function wavDurationMs(file: string): Promise<number | null> {
  const handle = await open(file, "r")
  try {
    const header = Buffer.alloc(4096)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    return wavDataDurationMs(header.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export function wavDataDurationMs(header: Uint8Array): number | null {
  const bytes = Buffer.from(header)
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF") return null
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    if (id === "data") return Math.round((size / 32_000) * 1000)
    offset += 8 + size + (size % 2)
  }
  return null
}
