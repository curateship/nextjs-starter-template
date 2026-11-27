import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { VaultItem } from "@/lib/viral/vault"
import { adminGet, adminPost } from "@/server/guards"
import { listVideoProjects, type VideoProjectOption } from "@/server/viral/video-link"
import { lastVideoProjectFor, refreshSendStatus, sendToVideo } from "@/server/viral/video-sends"
import { viralSays } from "@/lib/viral/viral"

/**
 * Send to Video (`workspace/docs/send-to-video.md`). In Content the link
 * between the two sets itself up (`workspace/docs/content-app.md`). Admin
 * only: it puts files into the editor.
 */

export type { VideoProjectOption }

const id = z.string().min(1).max(36)

const projectsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ viralProjectId: id }))
  .handler(async ({ data, context }): Promise<{ projects: VideoProjectOption[]; lastProjectId: string | null }> => {
    try {
      const [projects, lastProjectId] = await Promise.all([
        listVideoProjects(),
        lastVideoProjectFor(context.user.id, data.viralProjectId),
      ])
      return { projects, lastProjectId: projects.some((one) => one.id === lastProjectId) ? lastProjectId : null }
    } catch (error) {
      throw viralSays(error instanceof Error ? error.message.replace(/^VIRAL_SAYS: /, "") : "Video couldn't be reached.")
    }
  })

/** The Send to Video picker: Video's projects, and the one this Viral project sent to last if it is still there. */
export function loadVideoProjects(viralProjectId: string) {
  return projectsFn({ data: { viralProjectId } })
}

const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ itemId: id, videoProjectId: id, mode: z.enum(["new", "replace"]).nullable() }))
  .handler(async ({ data, context }): Promise<VaultItem> => sendToVideo(context.user.id, data))

/**
 * Send to Video. An idea sent before is refused unless `mode` says Replace
 * (the same draft) or Send as new (another draft).
 */
export function sendToVideoFn(input: { itemId: string; videoProjectId: string; mode: "new" | "replace" | null }) {
  return sendFn({ data: input })
}

const refreshFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ sendId: id }))
  .handler(async ({ data, context }): Promise<VaultItem> => refreshSendStatus(context.user.id, data.sendId))

/** Asks Video how a send still copying is doing. Ask at most every 20 seconds. */
export function refreshVideoSend(sendId: string) {
  return refreshFn({ data: { sendId } })
}
