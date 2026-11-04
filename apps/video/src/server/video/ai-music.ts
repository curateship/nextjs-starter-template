import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import {
  AI_MUSIC_EMPTY_VIDEO_MESSAGE,
  AI_MUSIC_FAILED_MESSAGE,
  AI_MUSIC_MODEL,
  AI_MUSIC_MOOD_MAX,
  AI_MUSIC_NO_MOOD_MESSAGE,
  aiMusicCostCents,
  aiMusicLengthMs,
  aiMusicName,
} from "@/lib/video/ai-music"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { getAiKey } from "@/server/ai/keys"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { markAsMusic } from "@/server/video/music"
import { requireVideoBudget, videoSpendMetadata } from "@/server/video/project-spend"
import { timelineEndMs } from "@/server/video/render"
import { recordVideoCharge, requireAllowanceRoom } from "@/server/video/video-meter"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Music made to fit a video, by ElevenLabs Music (workspace/docs/ai-music.md).
 *
 * The mood goes in with the video's length, and an instrumental MP3 of that
 * length comes back. It is kept in the media library and marked as music, so
 * it sits on the Music list like an upload and can be laid under any project.
 * The price is known before asking: ElevenLabs charges by the minute, so the
 * video's spend limit and the monthly allowance are checked first, and the
 * charge is written on the AI meter by Video itself (video-meter.ts), because
 * the shell's meter prices only the shell's own models.
 */

const MUSIC_URL = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128"
/** A 5 minute track has been seen to take a couple of minutes. */
const MUSIC_TIMEOUT_MS = 5 * 60_000

export async function makeAiMusic({
  userId,
  videoId,
  mood,
}: {
  userId: string
  videoId: string
  mood: string
}) {
  const prompt = mood.trim().slice(0, AI_MUSIC_MOOD_MAX)
  if (!prompt) throw new Error(AI_MUSIC_NO_MOOD_MESSAGE)
  const apiKey = await getAiKey("elevenlabs")
  if (!apiKey) throw new Error(ELEVENLABS_KEY_MISSING_MESSAGE)

  const unchecked = await requireVideoBudget(userId, videoId, 0)
  const videoMs = timelineEndMs(requireCanonicalTimeline(unchecked.timeline).tracks)
  if (videoMs <= 0) throw new Error(AI_MUSIC_EMPTY_VIDEO_MESSAGE)
  const lengthMs = aiMusicLengthMs(videoMs)
  const cents = aiMusicCostCents(lengthMs)

  // The month's allowance and the video's own limit, with this track counted in.
  await requireAllowanceRoom(userId, cents)
  const video = await requireVideoBudget(userId, videoId, cents)
  const charge = {
    userId,
    company: "elevenlabs" as const,
    feature: "ai_music",
    model: AI_MUSIC_MODEL,
    metadata: { ...videoSpendMetadata(video), seconds: Math.round(lengthMs / 1000) },
  }

  let bytes: Uint8Array
  try {
    const response = await fetch(MUSIC_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        music_length_ms: lengthMs,
        model_id: AI_MUSIC_MODEL,
        // Music under a video is there to be talked over.
        force_instrumental: true,
      }),
      signal: AbortSignal.timeout(MUSIC_TIMEOUT_MS),
    })
    if (!response.ok) {
      const said = await response.text().then((text) => text.slice(0, 500), () => "")
      console.error("ElevenLabs music", response.status, said)
      throw new Error(AI_MUSIC_FAILED_MESSAGE)
    }
    bytes = new Uint8Array(await response.arrayBuffer())
    if (!bytes.byteLength) throw new Error(AI_MUSIC_FAILED_MESSAGE)
  } catch (error) {
    await recordVideoCharge({ ...charge, status: "failed", cents: 0 })
    if (error instanceof Error && error.message === AI_MUSIC_FAILED_MESSAGE) throw error
    console.error("ElevenLabs music failed", error)
    throw new Error(AI_MUSIC_FAILED_MESSAGE)
  }
  await recordVideoCharge({ ...charge, status: "success", cents })

  const name = aiMusicName(prompt)
  const filename = `${uuid()}-music.mp3`
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
  await markAsMusic(userId, row.id)
  return { media: await serializeMedia(row), lengthMs, cents }
}
