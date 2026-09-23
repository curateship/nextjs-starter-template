import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  MUSIC_FILE_NOT_FOUND_MESSAGE,
  MUSIC_NOT_SOUND_MESSAGE,
} from "@/lib/video/background-music"
import { userGet, userPost } from "@/server/guards"
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
])

export function getMusicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
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
  })

const unmarkMusicFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(mediaIdSchema)
  .handler(async ({ data, context }) => {
    await unmarkMusic(context.user.id, data.mediaId)
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
