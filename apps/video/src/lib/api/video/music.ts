import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  MUSIC_FILE_NOT_FOUND_MESSAGE,
  MUSIC_NOT_SOUND_MESSAGE,
} from "@/lib/video/background-music"
import {
  AI_MUSIC_EMPTY_VIDEO_MESSAGE,
  AI_MUSIC_FAILED_MESSAGE,
  AI_MUSIC_MOOD_MAX,
  AI_MUSIC_NO_MOOD_MESSAGE,
} from "@/lib/video/ai-music"
import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { userGet, userPost } from "@/server/guards"
import { makeAiMusic } from "@/server/video/ai-music"
import { kickVideoMediaWorker } from "@/server/video/media-workers"
import {
  listMusicShelf,
  markAsMusic,
  unmarkMusic,
  type MusicShelfFile,
} from "@/server/video/music"

export type { MusicShelfFile }

/**
 * The studio's Music panel: one person's sound files and which of them are
 * marked as music. Per person, like collections, because the shelf is one
 * editor's own and follows them into every project.
 */

const KNOWN_MESSAGES = new Set([
  MUSIC_FILE_NOT_FOUND_MESSAGE,
  MUSIC_NOT_SOUND_MESSAGE,
  AI_MUSIC_NO_MOOD_MESSAGE,
  AI_MUSIC_EMPTY_VIDEO_MESSAGE,
  AI_MUSIC_FAILED_MESSAGE,
  ELEVENLABS_KEY_MISSING_MESSAGE,
])

export function getMusicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (isProjectSpendLimitMessage(message)) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return describeAuthError(message) ?? "The music shelf could not be changed."
}

const mediaIdSchema = z.object({ mediaId: z.string().min(1).max(36) })

const listMusicShelfFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listMusicShelf(context.user.id))

const markAsMusicFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(mediaIdSchema)
  .handler(async ({ data, context }) => {
    await markAsMusic(context.user.id, data.mediaId)
    kickVideoMediaWorker()
  })

const unmarkMusicFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(mediaIdSchema)
  .handler(async ({ data, context }) => {
    await unmarkMusic(context.user.id, data.mediaId)
  })

const makeMusicFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      mood: z.string().max(AI_MUSIC_MOOD_MAX),
    })
  )
  .handler(async ({ data, context }) => {
    const made = await makeAiMusic({ userId: context.user.id, ...data })
    kickVideoMediaWorker()
    return made
  })

export function loadMusicShelf() {
  return listMusicShelfFn()
}

export function addToMusicShelf(mediaId: string) {
  return markAsMusicFn({ data: { mediaId } })
}

export function removeFromMusicShelf(mediaId: string) {
  return unmarkMusicFn({ data: { mediaId } })
}

/**
 * Makes an instrumental track as long as the video from a few words of mood
 * (ai-music.md), puts it on the Music list, and hands back the file.
 */
export function makeMusicToFit(videoId: string, mood: string) {
  return makeMusicFn({ data: { videoId, mood } })
}
