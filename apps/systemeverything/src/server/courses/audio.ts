import { and, eq } from "drizzle-orm"

import { chapterBodyText, cleanChapterBody } from "@/lib/courses/chapter-body"
import type { AdminChapter } from "@/lib/courses/course-types"
import { now, uuid } from "@/server/auth/security"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { toAdminChapter } from "@/server/courses/courses"
import { textHash } from "@/server/courses/text-hash"
import { db, type CustomShellDb } from "@/server/db"
import { courseChapters, courses } from "@/server/courses/schema"
import { deleteFromR2, getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"

/**
 * A chapter read aloud. An admin presses "Make audio" in the chapter's
 * settings; it is never made on its own, because every one costs money on
 * the ElevenLabs key. The sound goes into the media library like any other
 * file, so the library's own tidy-up never mistakes it for a stray, and the
 * chapter remembers which version of its words it was made from.
 */

const BASE_URL = "https://api.elevenlabs.io"
const MODEL = "eleven_multilingual_v2"
/** Under the provider's own limit per request, with room to spare. */
const PIECE_LENGTH = 4_500
/** About $9 at the provider's price, which no chapter should need. */
export const MAX_AUDIO_CHARACTERS = 60_000

/** Splits the words at sentence ends, so no piece stops mid-word. */
export function audioPieces(text: string, size = PIECE_LENGTH): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*\s*/g) ?? []
  const pieces: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > size) {
      pieces.push(current.trim())
      current = ""
    }
    // A single sentence longer than a piece is cut where it has to be.
    let rest = sentence
    while (rest.length > size) {
      pieces.push(rest.slice(0, size).trim())
      rest = rest.slice(size)
    }
    current += rest
  }
  if (current.trim()) pieces.push(current.trim())
  return pieces
}

async function firstVoice(apiKey: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/voices`, {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(
      `ElevenLabs would not list its voices (${response.status}). Check the key in Settings → AI.`
    )
  }
  const { voices } = (await response.json()) as {
    voices?: { voice_id?: string; category?: string }[]
  }
  const voice =
    voices?.find((one) => one.category === "premade" && one.voice_id) ??
    voices?.find((one) => one.voice_id)
  if (!voice?.voice_id) throw new Error("This ElevenLabs account has no voices to read with.")
  return voice.voice_id
}

export async function makeChapterAudio(
  workspaceId: string,
  userId: string,
  chapterId: string,
  database: CustomShellDb = db
): Promise<AdminChapter> {
  const [found] = await database
    .select({ chapter: courseChapters })
    .from(courseChapters)
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(and(eq(courseChapters.id, chapterId), eq(courses.workspaceId, workspaceId)))
    .limit(1)
  if (!found) throw new Error("That chapter no longer exists. Refresh the page.")
  const { chapter } = found

  const words = chapterBodyText(cleanChapterBody(chapter.body)).replace(/\s+/g, " ").trim()
  if (!words) throw new Error("This chapter has no words to read aloud yet.")
  const text = `${chapter.title}. ${words}`
  if (text.length > MAX_AUDIO_CHARACTERS) {
    throw new Error(
      `This chapter is ${text.length.toLocaleString("en-US")} characters, and audio stops at ${MAX_AUDIO_CHARACTERS.toLocaleString("en-US")}. Split it into two chapters first.`
    )
  }

  const apiKey = await getAiKey("elevenlabs")
  if (!apiKey) throw new Error("Add an ElevenLabs key in Settings → AI first.")
  const voiceId = await firstVoice(apiKey)

  const parts: Uint8Array[] = []
  for (const piece of audioPieces(text)) {
    parts.push(
      await runAiCall(
        {
          userId,
          provider: "elevenlabs",
          model: MODEL,
          feature: "course-chapter-audio",
          metadata: { chapterId, characters: piece.length },
        },
        async () => {
          const response = await fetch(
            `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ text: piece, model_id: MODEL }),
              signal: AbortSignal.timeout(180_000),
            }
          )
          if (!response.ok) {
            throw new Error(
              `ElevenLabs refused to read the chapter (${response.status}). Check the key in Settings → AI.`
            )
          }
          return {
            result: new Uint8Array(await response.arrayBuffer()),
            // Charged by the character, which is what this provider counts.
            usage: { inputTokens: 0, outputTokens: 0, units: piece.length },
          }
        }
      )
    )
  }
  // MP3 is a run of frames, so the pieces play back to back as one file.
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }

  const filename = `${uuid()}-chapter-audio.mp3`
  const storagePath = `${userId}/${filename}`
  await uploadToR2(storagePath, bytes, "audio/mpeg")
  const at = now()
  try {
    await database.insert(customShellMedia).values({
      id: uuid(),
      workspaceId,
      userId,
      filename,
      originalName: `${chapter.title.slice(0, 200)} (read aloud).mp3`,
      altText: null,
      fileSize: bytes.byteLength,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath,
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    // A file nothing points at is rubbish; take it back out.
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }

  const [row] = await database
    .update(courseChapters)
    .set({
      audioUrl: await getPublicMediaUrl(storagePath),
      audioTextHash: textHash(words),
      updatedAt: at,
    })
    .where(eq(courseChapters.id, chapterId))
    .returning()
  return toAdminChapter(row)
}

/** Takes the audio off the chapter. The file stays in the media library. */
export async function removeChapterAudio(
  workspaceId: string,
  chapterId: string,
  database: CustomShellDb = db
): Promise<AdminChapter> {
  const [found] = await database
    .select({ id: courseChapters.id })
    .from(courseChapters)
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(and(eq(courseChapters.id, chapterId), eq(courses.workspaceId, workspaceId)))
    .limit(1)
  if (!found) throw new Error("That chapter no longer exists. Refresh the page.")
  const [row] = await database
    .update(courseChapters)
    .set({ audioUrl: "", audioTextHash: "", updatedAt: now() })
    .where(eq(courseChapters.id, chapterId))
    .returning()
  return toAdminChapter(row)
}
