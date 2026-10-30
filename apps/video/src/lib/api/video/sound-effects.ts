import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  SOUND_FILE_NOT_FOUND_MESSAGE,
  SOUND_NOT_SOUND_MESSAGE,
} from "@/lib/video/stock-sounds"
import { userGet, userPost } from "@/server/guards"
import type { MediaItem } from "@/server/media/library"
import {
  listSoundEffects,
  markAsSoundEffect,
  unmarkSoundEffect,
} from "@/server/video/sound-effects"

/**
 * The Sounds panel's own sounds: one person's sound files marked as sound
 * effects. Per person, like the music shelf, because it follows them into
 * every project.
 */

const KNOWN_MESSAGES = new Set([SOUND_FILE_NOT_FOUND_MESSAGE, SOUND_NOT_SOUND_MESSAGE])

export function getSoundEffectErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Your sounds could not be changed."
}

const mediaIdSchema = z.object({ mediaId: z.string().min(1).max(36) })

const listSoundEffectsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<MediaItem[]> =>
    listSoundEffects(context.user.id)
  )

const markSoundEffectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(mediaIdSchema)
  .handler(async ({ data, context }) => {
    await markAsSoundEffect(context.user.id, data.mediaId)
  })

const unmarkSoundEffectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(mediaIdSchema)
  .handler(async ({ data, context }) => {
    await unmarkSoundEffect(context.user.id, data.mediaId)
  })

export function loadSoundEffects() {
  return listSoundEffectsFn()
}

export function addSoundEffect(mediaId: string) {
  return markSoundEffectFn({ data: { mediaId } })
}

export function removeSoundEffect(mediaId: string) {
  return unmarkSoundEffectFn({ data: { mediaId } })
}
