import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { editorPost } from "@/server/video/editor-guards"
import { kickVideoMediaWorker } from "@/server/video/media-workers"
import { actorForMedia } from "@/server/video/project-guests"
import { requestOwnedSteadyCopy, type SteadyCopyState } from "@/server/video/steady-copies"

export type { SteadyCopyState }

/**
 * A clip's Steady switch (steady-shaky-footage.md): where its video's
 * steadied copy stands, asking for it the first time. A guest sent from
 * Project is answered for their project's files, as cleaned sound is.
 */
const requestSteadyCopyFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ mediaId: z.string().min(1).max(36), retry: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const { userId } = await actorForMedia(context.caller, data.mediaId)
    const state = await requestOwnedSteadyCopy(userId, data.mediaId, { retry: data.retry })
    if (state.status === "preparing") kickVideoMediaWorker()
    return state
  })

export function requestSteadyCopy(mediaId: string, retry = false) {
  return requestSteadyCopyFn({ data: { mediaId, retry } })
}
