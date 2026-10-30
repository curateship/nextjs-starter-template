import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { VOICE_CLEAN_STRENGTHS } from "@/lib/video/voice-clean"
import { editorGet, editorPost } from "@/server/video/editor-guards"
import { kickVideoMediaWorker } from "@/server/video/media-workers"
import { actorForMedia } from "@/server/video/project-guests"
import {
  readOwnedBeats,
  requestOwnedCleanSound,
  type BeatsState,
  type CleanSoundState,
} from "@/server/video/sound-tools"

export type { BeatsState, CleanSoundState }

/**
 * The editor's two sound tools that wait on the background worker: a
 * cleaned copy of a clip's sound for the preview, and a music file's beats
 * for snapping. A guest sent from Project is answered for their project's
 * files, as the waveform route is.
 */

const requestCleanSoundFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      mediaId: z.string().min(1).max(36),
      strength: z.enum(VOICE_CLEAN_STRENGTHS),
      retry: z.boolean().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = await actorForMedia(context.caller, data.mediaId)
    const state = await requestOwnedCleanSound(userId, data.mediaId, data.strength, {
      retry: data.retry,
    })
    if (state.status === "preparing") kickVideoMediaWorker()
    return state
  })

const readBeatsFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(
    z.object({ mediaIds: z.array(z.string().min(1).max(36)).max(200) })
  )
  .handler(async ({ data, context }) => {
    // Grouped by whose files they are: a guest's project files belong to the
    // project's owner, and anything else to the person signed in.
    const byOwner = new Map<string, string[]>()
    for (const mediaId of new Set(data.mediaIds)) {
      const { userId } = await actorForMedia(context.caller, mediaId).catch(
        () => ({ userId: null })
      )
      if (!userId) continue
      byOwner.set(userId, [...(byOwner.get(userId) ?? []), mediaId])
    }
    const states: Record<string, BeatsState> = {}
    for (const [userId, mediaIds] of byOwner) {
      Object.assign(states, await readOwnedBeats(userId, mediaIds))
    }
    return states
  })

/** Where one file's cleaned copy stands, asking for it if it was never made. */
export function requestCleanSound(
  mediaId: string,
  strength: (typeof VOICE_CLEAN_STRENGTHS)[number],
  retry = false
) {
  return requestCleanSoundFn({ data: { mediaId, strength, retry } })
}

/** The beats of whichever of these files are music and found so far. */
export function readMusicBeats(mediaIds: string[]) {
  return readBeatsFn({ data: { mediaIds } })
}
