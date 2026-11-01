import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  VOICEOVER_SEARCH_MAX,
  type SavedVoiceover,
} from "@/lib/video/saved-voiceovers"
import { userGet, userPost } from "@/server/guards"
import { listVoiceovers, removeVoiceover } from "@/server/video/voiceovers"

export type { SavedVoiceover }

/**
 * The studio's Voiceovers panel: every voiceover one person has had read
 * aloud, searchable by what it says. Per person, like the music shelf, so it
 * follows them into every project.
 */

export function getVoiceoverErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return describeAuthError(message) ?? "Your voiceovers could not be loaded."
}

const listVoiceoversFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ search: z.string().max(VOICEOVER_SEARCH_MAX) }))
  .handler(async ({ data, context }) =>
    listVoiceovers(context.user.id, data.search)
  )

export function loadVoiceovers(search: string) {
  return listVoiceoversFn({ data: { search } })
}

const removeVoiceoverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ mediaId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    await removeVoiceover(context.user.id, data.mediaId)
  })

/** Takes a voiceover off the Voiceovers list. The file stays in the library. */
export function removeFromVoiceovers(mediaId: string) {
  return removeVoiceoverFn({ data: { mediaId } })
}
