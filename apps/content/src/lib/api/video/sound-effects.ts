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
import { makeAiSoundEffect } from "@/server/video/ai-sound-effects"
import { kickVideoMediaWorker } from "@/server/video/media-workers"
import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  AI_SOUND_FAILED_MESSAGE,
  AI_SOUND_LENGTH_MESSAGE,
  AI_SOUND_MAX_SECONDS,
  AI_SOUND_NO_WORDS_MESSAGE,
  AI_SOUND_WORDS_MAX,
} from "@/lib/video/ai-sound-effects"

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

const makeSoundFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      words: z.string().max(AI_SOUND_WORDS_MAX),
      seconds: z.number().positive().max(AI_SOUND_MAX_SECONDS).nullable(),
    })
  )
  .handler(async ({ data, context }) => {
    const made = await makeAiSoundEffect({ userId: context.user.id, ...data })
    kickVideoMediaWorker()
    return made
  })

/**
 * Makes a sound effect from a few words (ai-sound-effects.md) and keeps it
 * in Your sounds. `seconds` null lets ElevenLabs choose the length.
 */
export function makeSoundEffect(videoId: string, words: string, seconds: number | null) {
  return makeSoundFn({ data: { videoId, words, seconds } })
}

const MAKE_MESSAGES = new Set([AI_SOUND_FAILED_MESSAGE, AI_SOUND_LENGTH_MESSAGE, AI_SOUND_NO_WORDS_MESSAGE])

export function getMakeSoundErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (MAKE_MESSAGES.has(message)) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  return getAiToolErrorMessage(error)
}
