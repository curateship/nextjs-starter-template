import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { VaultItem } from "@/lib/viral/vault"
import { adminGet, adminPost } from "@/server/guards"
import {
  getVideoApiKey,
  getVideoKeyStatus,
  getVideoUrl,
  removeVideoApiKey,
  saveVideoApiKey,
  saveVideoUrl,
  type SavedKeyStatus,
} from "@/server/viral/settings"
import { cleanVideoUrl, helloVideo, listVideoProjects, type VideoProjectOption } from "@/server/viral/video-link"
import { lastVideoProjectFor, refreshSendStatus, sendToVideo } from "@/server/viral/video-sends"
import { viralSays } from "@/lib/viral/viral"

/**
 * Settings → Video connection, and Send to Video (`workspace/docs/send-to-video.md`).
 * Admin only: the key is the site's and puts files into Video.
 */

export type { SavedKeyStatus, VideoProjectOption }

export type VideoConnectionStatus = { url: string; key: SavedKeyStatus }

const id = z.string().min(1).max(36)

async function connectionStatus(): Promise<VideoConnectionStatus> {
  const [url, key] = await Promise.all([getVideoUrl(), getVideoKeyStatus()])
  return { url, key }
}

const statusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => connectionStatus())

export function loadVideoConnection() {
  return statusFn()
}

const saveUrlFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ url: z.string().max(500) }))
  .handler(async ({ data }) => {
    const cleaned = cleanVideoUrl(data.url)
    if (cleaned === null) throw viralSays("That isn't a web address. It starts with https://.")
    await saveVideoUrl(cleaned)
    return connectionStatus()
  })

/** Video's address, saved as it is typed. */
export function saveVideoUrlFn(url: string) {
  return saveUrlFn({ data: { url } })
}

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(200) }))
  .handler(async ({ data }): Promise<SavedKeyStatus> => {
    await saveVideoApiKey(data.apiKey)
    return getVideoKeyStatus()
  })

/** The key Video made on its Settings → Viral, kept scrambled. */
export function saveVideoKeyFn(apiKey: string) {
  return saveKeyFn({ data: { apiKey } })
}

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async (): Promise<SavedKeyStatus> => {
    await removeVideoApiKey()
    return getVideoKeyStatus()
  })

export function removeVideoKeyFn() {
  return removeKeyFn()
}

const testFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().max(200).optional() }))
  .handler(async ({ data }): Promise<{ ok: true; message: string } | { ok: false; message: string }> => {
    const url = await getVideoUrl()
    if (!url) return { ok: false, message: "Fill in Video's address first." }
    const key = data.apiKey?.trim() || (await getVideoApiKey())
    if (!key) return { ok: false, message: "There is no key to test. Paste one first." }
    try {
      const answer = await helloVideo({ url, key })
      const count = answer.projects.length
      return {
        ok: true,
        message: `Connected to ${answer.name ? `${answer.name}'s ` : ""}Video, with ${count} ${count === 1 ? "project" : "projects"}.`,
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Video didn't answer." }
    }
  })

/**
 * Test on Settings → Video connection: tells Video this Viral's address,
 * which Video needs before it fetches anything, and says whose Video answered.
 */
export function testVideoConnection(apiKey?: string) {
  return testFn({ data: { apiKey } })
}

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
