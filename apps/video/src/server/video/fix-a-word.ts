import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { and, eq } from "drizzle-orm"

import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import {
  FIX_WORD_FAILED_MESSAGE,
  FIX_WORD_MODEL,
  FIX_WORD_NO_TEXT_MESSAGE,
  FIX_WORD_NOT_SOUND_MESSAGE,
  FIX_WORD_SAMPLE_TOO_SHORT_MESSAGE,
  FIX_WORD_TEXT_MAX,
  VOICE_COPY_MIN_SECONDS,
  VOICE_COPY_SAMPLE_SECONDS,
  fixWordCostCents,
  type NewWords,
} from "@/lib/video/fix-a-word"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { voiceCleanFilter } from "@/lib/video/voice-clean"
import { alignmentToWords, voiceoverRequestBody, type VoiceAlignment } from "@/lib/video/voice"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { deleteFromR2, getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { requireVideoBudget, videoSpendMetadata } from "@/server/video/project-spend"
import { inputArgs } from "@/server/video/render-sources"
import { videoMediaVoiceCopies } from "@/server/video/schema"
import { openSoundSource } from "@/server/video/sound-source"
import { soundDurationMs } from "@/server/video/voice"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Fix a word you said wrong (workspace/docs/fix-a-word.md). The first fix in
 * a recording copies the voice from about a minute of that recording, from
 * where the clip starts, and keeps the copy for the file. Then the new words
 * are said in it, and the sound is kept in the media library for the editor
 * to swap in. Nothing here touches the timeline.
 */

const BASE_URL = "https://api.elevenlabs.io"

async function requireKey() {
  const key = await getAiKey("elevenlabs")
  if (!key) throw new Error(ELEVENLABS_KEY_MISSING_MESSAGE)
  return key
}

/** The voice copy for this file, made from the recording the first time. */
async function voiceCopyFor(
  userId: string,
  media: { id: string; originalName: string },
  clip: { trimStartMs: number; voiceClean?: Parameters<typeof voiceCleanFilter>[0] },
  apiKey: string,
  database: CustomShellDb
) {
  const [kept] = await database
    .select({ voiceId: videoMediaVoiceCopies.voiceId })
    .from(videoMediaVoiceCopies)
    .where(eq(videoMediaVoiceCopies.mediaId, media.id))
    .limit(1)
  if (kept) return kept.voiceId

  const dir = await mkdtemp(path.join(tmpdir(), "video-voice-copy-"))
  const source = await openSoundSource(media.id)
  let sample: Uint8Array
  try {
    const out = path.join(dir, "sample.mp3")
    // Only the minute after the clip's start is read, even from a big
    // original straight from storage.
    await runFfmpeg(
      [
        "-ss",
        String(clip.trimStartMs / 1000),
        "-t",
        String(VOICE_COPY_SAMPLE_SECONDS),
        ...inputArgs(source.input),
        "-vn",
        "-ac",
        "1",
        ...(clip.voiceClean ? ["-af", voiceCleanFilter(clip.voiceClean)] : []),
        "-c:a",
        "libmp3lame",
        "-q:a",
        "2",
        out,
      ],
      FIX_WORD_FAILED_MESSAGE
    )
    sample = new Uint8Array(await readFile(out))
  } finally {
    await source.release().catch(() => undefined)
    await rm(dir, { recursive: true, force: true })
  }
  const lengthMs = await soundDurationMs(sample, (VOICE_COPY_SAMPLE_SECONDS + 1) * 1000).catch(() => 0)
  if (lengthMs < VOICE_COPY_MIN_SECONDS * 1000) throw new Error(FIX_WORD_SAMPLE_TOO_SHORT_MESSAGE)

  const form = new FormData()
  form.append("name", `Fix a word: ${media.originalName}`.slice(0, 100))
  form.append("remove_background_noise", "true")
  form.append("files", new Blob([sample.buffer as ArrayBuffer], { type: "audio/mpeg" }), "sample.mp3")
  const response = await fetch(`${BASE_URL}/v1/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(120_000),
  })
  const body = await response.text().catch(() => "")
  const voiceId = response.ok ? (JSON.parse(body || "{}") as { voice_id?: string }).voice_id : undefined
  if (!voiceId) {
    console.error("ElevenLabs voice copy", response.status, body.slice(0, 500))
    throw new Error(FIX_WORD_FAILED_MESSAGE)
  }
  const saved = await database
    .insert(videoMediaVoiceCopies)
    .values({ mediaId: media.id, userId, voiceId, createdAt: now() })
    .onConflictDoNothing()
    .returning({ voiceId: videoMediaVoiceCopies.voiceId })
    .catch(() => [])
  if (saved.length) return voiceId
  // Another fix in the same recording kept its copy first, or the row could
  // not be written. A voice nothing here points at would sit at ElevenLabs
  // forever, so this one goes, and the kept one is used.
  await deleteVoiceAtElevenLabs(apiKey, voiceId).catch(() => undefined)
  const [first] = await database
    .select({ voiceId: videoMediaVoiceCopies.voiceId })
    .from(videoMediaVoiceCopies)
    .where(eq(videoMediaVoiceCopies.mediaId, media.id))
    .limit(1)
  if (!first) throw new Error(FIX_WORD_FAILED_MESSAGE)
  return first.voiceId
}

/**
 * The new words, said in a copy of the voice in this clip's recording and
 * kept as a sound in the media library. The price is checked against the
 * video's spend limit before anything is sent.
 */
export async function sayWordsAgain({
  userId,
  videoId,
  clipId,
  text,
  database = db,
}: {
  userId: string
  videoId: string
  clipId: string
  text: string
  database?: CustomShellDb
}): Promise<NewWords & { cents: number }> {
  const words = text.trim().replace(/\s+/g, " ").slice(0, FIX_WORD_TEXT_MAX)
  if (!words) throw new Error(FIX_WORD_NO_TEXT_MESSAGE)
  const cents = fixWordCostCents(words)
  const video = await requireVideoBudget(userId, videoId, cents)
  const clip = requireCanonicalTimeline(video.timeline)
    .tracks.flatMap((track) => track.clips)
    .find((one) => one.id === clipId)
  if (!clip?.mediaId || (clip.kind !== "video" && clip.kind !== "audio")) {
    throw new Error(FIX_WORD_NOT_SOUND_MESSAGE)
  }
  const [media] = await database
    .select({ id: customShellMedia.id, originalName: customShellMedia.originalName })
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, clip.mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)
  if (!media) throw new Error(FIX_WORD_NOT_SOUND_MESSAGE)

  const apiKey = await requireKey()
  const voiceId = await voiceCopyFor(userId, media, clip, apiKey, database)
  const answer = await runAiCall(
    {
      userId,
      provider: "elevenlabs",
      model: FIX_WORD_MODEL,
      feature: "fix_a_word",
      metadata: { ...videoSpendMetadata(video), characters: words.length },
    },
    async () => {
      const response = await fetch(
        `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(voiceoverRequestBody(words, FIX_WORD_MODEL)),
          signal: AbortSignal.timeout(60_000),
        }
      )
      if (!response.ok) {
        console.error("ElevenLabs fix a word", response.status, (await response.text().catch(() => "")).slice(0, 500))
        throw new Error(FIX_WORD_FAILED_MESSAGE)
      }
      const result = (await response.json()) as { audio_base64?: string; alignment?: VoiceAlignment | null }
      return { result, usage: { inputTokens: 0, outputTokens: 0, units: words.length } }
    }
  )
  if (!answer.audio_base64) throw new Error(FIX_WORD_FAILED_MESSAGE)
  const bytes = new Uint8Array(Buffer.from(answer.audio_base64, "base64"))
  const durationMs =
    (answer.alignment ? alignmentToWords(answer.alignment).at(-1)?.endMs : undefined) ??
    (await soundDurationMs(bytes, 60_000).catch(() => 0))
  if (!durationMs) throw new Error(FIX_WORD_FAILED_MESSAGE)

  const name = `Fixed - ${words.slice(0, 50)}`
  const filename = `${uuid()}-fixed-words.mp3`
  const storagePath = `${userId}/${filename}`
  await uploadToR2(storagePath, bytes, "audio/mpeg")
  const at = now()
  const row = {
    id: uuid(),
    workspaceId: await workspaceIdForRequest(userId),
    userId,
    filename,
    originalName: `${name}.mp3`,
    altText: null,
    fileSize: bytes.byteLength,
    mimeType: "audio/mpeg",
    fileType: "audio",
    storagePath,
    emailProtectedAt: null,
    createdAt: at,
    updatedAt: at,
  }
  try {
    await database.insert(customShellMedia).values(row)
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
  return { mediaId: row.id, url: await getPublicMediaUrl(storagePath), name, durationMs, cents }
}

async function deleteVoiceAtElevenLabs(apiKey: string, voiceId: string) {
  const response = await fetch(`${BASE_URL}/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Deleting a voice copy failed (HTTP ${response.status})`)
  }
}

/**
 * Deletes the voice copy made from a file, at ElevenLabs and here, before the
 * file itself goes. A copy that can't be deleted at ElevenLabs is logged and
 * the file still goes; the row goes with the file either way.
 */
export async function forgetVoiceCopy(mediaId: string, database: CustomShellDb = db) {
  const [kept] = await database
    .select({ voiceId: videoMediaVoiceCopies.voiceId })
    .from(videoMediaVoiceCopies)
    .where(eq(videoMediaVoiceCopies.mediaId, mediaId))
    .limit(1)
  if (!kept) return
  const apiKey = await getAiKey("elevenlabs")
  if (apiKey) {
    await deleteVoiceAtElevenLabs(apiKey, kept.voiceId).catch((error) =>
      console.error("Deleting a voice copy at ElevenLabs failed", mediaId, error)
    )
  }
  await database.delete(videoMediaVoiceCopies).where(eq(videoMediaVoiceCopies.mediaId, mediaId))
}
