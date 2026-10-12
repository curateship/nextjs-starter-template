import { and, desc, eq } from "drizzle-orm"

import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import {
  PROVIDER_SAID,
  plainSoundType,
  sampleLengthRefusal,
  VOICE_CLONE_DELETE_FAILED_MESSAGE,
  VOICE_CLONE_FAILED_MESSAGE,
  VOICE_CLONE_NAME_MAX,
  VOICE_CLONE_NAME_MESSAGE,
  VOICE_CLONE_NOT_FOUND_MESSAGE,
  VOICE_CLONE_PLAN_MESSAGE,
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MAX_MS,
  VOICE_SAMPLE_MISSING_MESSAGE,
  VOICE_SAMPLE_TOO_BIG_MESSAGE,
  VOICE_SAMPLE_TYPE_MESSAGE,
  VOICE_SAMPLE_TYPES,
  VOICE_SAMPLE_UNREADABLE_MESSAGE,
} from "@/lib/video/voice-clone"
import { getAiKey } from "@/server/ai/keys"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { cleanOriginalName, storedFilename } from "@/server/media/library"
import { deleteFromR2, getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { videoClonedVoices } from "@/server/video/schema"
import { soundDurationMs } from "@/server/video/voice"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Voices made from a person's own sample.
 *
 * ElevenLabs makes an instant clone from 10 to 60 seconds of speech and hands
 * back a voice id that reads like any other voice. Making one is not charged
 * by the call; it needs a paid ElevenLabs plan, and reading with it costs the
 * same characters as any voice. Nothing goes on the AI meter here, and a clone
 * that fails leaves nothing behind: no file, no row.
 *
 * The sample is kept in the media library, so the person can hear what the
 * voice was made from and it can be used again. Deleting the voice deletes it
 * at ElevenLabs first, and only then here, so a voice is never left at
 * ElevenLabs with nobody able to see it.
 */

const BASE_URL = "https://api.elevenlabs.io"

export type ClonedVoice = {
  id: string
  voiceId: string
  name: string
  /** The recording it was made from, or null once that file was deleted. */
  sampleUrl: string | null
  createdAt: string
}

/** One person's voices, newest first. */
export async function listClonedVoices(
  userId: string,
  database: CustomShellDb = db
): Promise<ClonedVoice[]> {
  const rows = await database
    .select({
      id: videoClonedVoices.id,
      voiceId: videoClonedVoices.voiceId,
      name: videoClonedVoices.name,
      createdAt: videoClonedVoices.createdAt,
      storagePath: customShellMedia.storagePath,
    })
    .from(videoClonedVoices)
    .leftJoin(
      customShellMedia,
      eq(customShellMedia.id, videoClonedVoices.sampleMediaId)
    )
    .where(eq(videoClonedVoices.userId, userId))
    .orderBy(desc(videoClonedVoices.createdAt))
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      voiceId: row.voiceId,
      name: row.name,
      sampleUrl: row.storagePath
        ? await getPublicMediaUrl(row.storagePath)
        : null,
      createdAt: row.createdAt.toISOString(),
    }))
  )
}

async function requireKey() {
  const key = await getAiKey("elevenlabs")
  if (!key) throw new Error(ELEVENLABS_KEY_MISSING_MESSAGE)
  return key
}

/**
 * The provider's own sentence, out of whichever shape it came in:
 * `{detail: {status, message}}`, a 422's `{detail: [{msg}]}`, or plain text.
 */
export function readProviderComplaint(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      detail?: { status?: string; message?: string } | { msg?: string }[]
    }
    const detail = parsed.detail
    if (Array.isArray(detail)) {
      return { status: "", message: detail.map((one) => one.msg).join(" ") }
    }
    return { status: detail?.status ?? "", message: detail?.message ?? "" }
  } catch {
    return { status: "", message: body.trim() }
  }
}

/** A refusal in words a person can act on, with the provider's own words. */
function cloneRefusal(httpStatus: number, body: string) {
  const { status, message } = readProviderComplaint(body)
  const said = message.slice(0, 300)
  const wantsPlan =
    /voice_cloning|subscription|plan/i.test(status) ||
    /upgrade|subscription|plan/i.test(said)
  if (wantsPlan) {
    return said ? `${VOICE_CLONE_PLAN_MESSAGE} ${PROVIDER_SAID}${said}` : VOICE_CLONE_PLAN_MESSAGE
  }
  if (said) return `${PROVIDER_SAID}${said}`
  console.error("ElevenLabs voice clone", httpStatus, body.slice(0, 500))
  return VOICE_CLONE_FAILED_MESSAGE
}

type Sample = { bytes: Uint8Array; type: string; name: string }

/**
 * Makes a voice from a sample and keeps the sample in the media library.
 *
 * Checked before anything is sent: the name, the type, the size, and the
 * length, which ffmpeg reads from the sound itself.
 */
export async function makeClonedVoice(
  userId: string,
  { name, sample }: { name: string; sample: Sample | null },
  database: CustomShellDb = db
): Promise<{ voice: ClonedVoice; needsVerifying: boolean }> {
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, VOICE_CLONE_NAME_MAX)
  if (!cleanName) throw new Error(VOICE_CLONE_NAME_MESSAGE)
  if (!sample?.bytes.byteLength) throw new Error(VOICE_SAMPLE_MISSING_MESSAGE)
  // An .m4a from a Mac says audio/x-m4a; the library knows it as audio/mp4.
  const plainType = plainSoundType(sample.type)
  const type = plainType === "audio/x-m4a" ? "audio/mp4" : plainType
  if (!VOICE_SAMPLE_TYPES.includes(type)) throw new Error(VOICE_SAMPLE_TYPE_MESSAGE)
  if (sample.bytes.byteLength > VOICE_SAMPLE_MAX_BYTES) {
    throw new Error(VOICE_SAMPLE_TOO_BIG_MESSAGE)
  }

  await enforceRateLimit(
    `voice-clone:${userId}`,
    { maxAttempts: 10, windowSeconds: 60 * 60 },
    database
  )

  // Read one second past the limit, so a long file is measured as too long
  // without being read to the end.
  const durationMs = await soundDurationMs(
    sample.bytes,
    VOICE_SAMPLE_MAX_MS + 1_000
  ).catch(() => 0)
  if (!durationMs) throw new Error(VOICE_SAMPLE_UNREADABLE_MESSAGE)
  const tooLongOrShort = sampleLengthRefusal(durationMs)
  if (tooLongOrShort) throw new Error(tooLongOrShort)

  const apiKey = await requireKey()
  const form = new FormData()
  form.append("name", cleanName)
  form.append(
    "files",
    new Blob([new Uint8Array(sample.bytes).buffer as ArrayBuffer], { type }),
    sample.name || "sample"
  )
  const response = await fetch(`${BASE_URL}/v1/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(120_000),
  })
  const body = await response.text().catch(() => "")
  if (!response.ok) throw new Error(cloneRefusal(response.status, body))
  let answer: { voice_id?: string; requires_verification?: boolean } = {}
  try {
    answer = JSON.parse(body)
  } catch {
    // Handled below: no voice id is a failure whatever the reason.
  }
  const voiceId = answer.voice_id
  if (!voiceId) {
    console.error("ElevenLabs voice clone came back without a voice id", body.slice(0, 500))
    throw new Error(VOICE_CLONE_FAILED_MESSAGE)
  }

  try {
    const voice = await keepSample(userId, cleanName, voiceId, {
      ...sample,
      type,
    }, database)
    return { voice, needsVerifying: answer.requires_verification === true }
  } catch (error) {
    // A voice nobody here can see or delete would sit at ElevenLabs forever.
    await deleteAtElevenLabs(apiKey, voiceId).catch(() => undefined)
    throw error
  }
}

async function keepSample(
  userId: string,
  name: string,
  voiceId: string,
  sample: Sample,
  database: CustomShellDb
): Promise<ClonedVoice> {
  const originalName = cleanOriginalName(sample.name || `${name} voice sample`)
  const filename = storedFilename(originalName, sample.type)
  const storagePath = `${userId}/${filename}`
  await uploadToR2(storagePath, sample.bytes, sample.type)

  const at = now()
  const mediaId = uuid()
  const id = uuid()
  try {
    // The site the voice was made in is the site that keeps its sample.
    const workspaceId = await workspaceIdForRequest(userId, database)
    await database.transaction(async (tx) => {
      await tx.insert(customShellMedia).values({
        id: mediaId,
        workspaceId,
        userId,
        filename,
        originalName,
        altText: null,
        fileSize: sample.bytes.byteLength,
        mimeType: sample.type,
        fileType: "audio",
        storagePath,
        createdAt: at,
        updatedAt: at,
      })
      await tx.insert(videoClonedVoices).values({
        id,
        userId,
        voiceId,
        name,
        sampleMediaId: mediaId,
        createdAt: at,
      })
    })
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
  return {
    id,
    voiceId,
    name,
    sampleUrl: await getPublicMediaUrl(storagePath),
    createdAt: at.toISOString(),
  }
}

/** Deletes a voice at ElevenLabs. A voice already gone there counts as done. */
async function deleteAtElevenLabs(apiKey: string, voiceId: string) {
  const response = await fetch(
    `${BASE_URL}/v1/voices/${encodeURIComponent(voiceId)}`,
    {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    }
  )
  if (response.ok || response.status === 404) return
  const body = await response.text().catch(() => "")
  console.error("ElevenLabs voice delete", response.status, body.slice(0, 500))
  const { message } = readProviderComplaint(body)
  throw new Error(
    message
      ? `${VOICE_CLONE_DELETE_FAILED_MESSAGE} ${PROVIDER_SAID}${message.slice(0, 300)}`
      : VOICE_CLONE_DELETE_FAILED_MESSAGE
  )
}

/**
 * Deletes one of a person's voices, at ElevenLabs first and then here. The
 * sample stays in the media library and voiceovers already read with the
 * voice keep playing, because they are ordinary sound files.
 */
export async function deleteClonedVoice(
  userId: string,
  id: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ voiceId: videoClonedVoices.voiceId })
    .from(videoClonedVoices)
    .where(and(eq(videoClonedVoices.id, id), eq(videoClonedVoices.userId, userId)))
    .limit(1)
  if (!row) throw new Error(VOICE_CLONE_NOT_FOUND_MESSAGE)
  await deleteAtElevenLabs(await requireKey(), row.voiceId)
  await database
    .delete(videoClonedVoices)
    .where(and(eq(videoClonedVoices.id, id), eq(videoClonedVoices.userId, userId)))
}
