import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import {
  AI_SOUND_FAILED_MESSAGE,
  AI_SOUND_LENGTH_MESSAGE,
  AI_SOUND_MODEL,
  AI_SOUND_NO_WORDS_MESSAGE,
  AI_SOUND_WORDS_MAX,
  aiSoundCostCents,
  aiSoundLengthOk,
  aiSoundName,
} from "@/lib/video/ai-sound-effects"
import { getAiKey } from "@/server/ai/keys"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { requireVideoBudget, videoSpendMetadata } from "@/server/video/project-spend"
import { markAsSoundEffect } from "@/server/video/sound-effects"
import { recordVideoCharge, requireAllowanceRoom } from "@/server/video/video-meter"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * A sound effect made from a few words (workspace/docs/ai-sound-effects.md),
 * with the same ElevenLabs key as AI music. It is kept in the media library
 * and marked as a sound effect, so it sits in Your sounds like an upload.
 * The price is known before asking, so the allowance and the video's spend
 * limit are checked first and Video writes the charge itself, as AI music
 * does (ai-music.ts).
 */

const SOUND_URL = "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
const SOUND_TIMEOUT_MS = 2 * 60_000

export async function makeAiSoundEffect({
  userId,
  videoId,
  words,
  seconds,
}: {
  userId: string
  videoId: string
  words: string
  seconds: number | null
}) {
  const text = words.trim().slice(0, AI_SOUND_WORDS_MAX)
  if (!text) throw new Error(AI_SOUND_NO_WORDS_MESSAGE)
  if (!aiSoundLengthOk(seconds)) throw new Error(AI_SOUND_LENGTH_MESSAGE)
  const apiKey = await getAiKey("elevenlabs")
  if (!apiKey) throw new Error(ELEVENLABS_KEY_MISSING_MESSAGE)

  const cents = aiSoundCostCents(seconds)
  await requireAllowanceRoom(userId, cents)
  const video = await requireVideoBudget(userId, videoId, cents)
  const charge = {
    userId,
    company: "elevenlabs" as const,
    feature: "ai_sound_effect",
    model: AI_SOUND_MODEL,
    metadata: { ...videoSpendMetadata(video), seconds: seconds ?? "auto" },
  }

  let bytes: Uint8Array
  try {
    const response = await fetch(SOUND_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: AI_SOUND_MODEL,
        ...(seconds !== null ? { duration_seconds: seconds } : {}),
      }),
      signal: AbortSignal.timeout(SOUND_TIMEOUT_MS),
    })
    if (!response.ok) {
      const said = await response.text().then((body) => body.slice(0, 500), () => "")
      console.error("ElevenLabs sound effect", response.status, said)
      throw new Error(AI_SOUND_FAILED_MESSAGE)
    }
    bytes = new Uint8Array(await response.arrayBuffer())
    if (!bytes.byteLength) throw new Error(AI_SOUND_FAILED_MESSAGE)
  } catch (error) {
    await recordVideoCharge({ ...charge, status: "failed", cents: 0 })
    if (error instanceof Error && error.message === AI_SOUND_FAILED_MESSAGE) throw error
    console.error("ElevenLabs sound effect failed", error)
    throw new Error(AI_SOUND_FAILED_MESSAGE)
  }
  await recordVideoCharge({ ...charge, status: "success", cents })

  const name = aiSoundName(text)
  const filename = `${uuid()}-sound.mp3`
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
    await db.insert(customShellMedia).values(row)
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
  await markAsSoundEffect(userId, row.id)
  return { media: await serializeMedia(row), cents }
}
