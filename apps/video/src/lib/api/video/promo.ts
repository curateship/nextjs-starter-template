import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import {
  MAX_PROMO_EXPORTS_PER_SEND,
  MAX_PROMO_PROJECTS_PER_SEND,
  PROMO_DRAFT_NETWORKS,
  type PromoProjectOption,
  type PromoSendView,
} from "@/lib/video/promo"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { adminGet, adminPost } from "@/server/guards"
import type { SavedKeyStatus } from "@/server/video/settings"

export type { PromoProjectOption, PromoSendView }

/**
 * Send to Promo (`workspace/docs/send-to-promo.md`): Promo's address and key
 * on Settings → Promo, the project list, sending and watching the sends. All
 * of it is admin only, because the key is the site's and puts files into
 * Promo.
 */

const describeError = createErrorMessage(
  {
    EMPTY_KEY: "Paste a key first.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE: "The saved key can no longer be read. Paste it again.",
    RATE_LIMITED: "That's a lot of sends at once. Wait a minute and try again.",
  },
  "That did not work. Try again in a moment."
)

/**
 * Promo's own words and Video's plain refusals pass through: one sentence
 * ending in a full stop. A code such as RATE_LIMITED is put in words, and
 * anything that looks like the server's own text (a failed query, a stack,
 * several lines) becomes the plain default, so internal text never reaches a
 * popup.
 */
export function getPromoErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const plain =
    /^[A-Z][^\n]{3,300}[.!?]$/.test(message) && !/^Failed query|\bat \/|ECONN|duplicate key|violates/i.test(message)
  return plain ? message : describeError(error)
}

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => {
    const settings = await import("@/server/video/settings")
    return { url: await settings.getPromoUrl(), key: await settings.getPromoKeyStatus() }
  })

/** Promo's address and what is known about its key, for Settings → Promo. */
export function loadPromoSettings(): Promise<{ url: string; key: SavedKeyStatus }> {
  return loadFn()
}

const saveUrlFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ url: z.string().max(500) }))
  .handler(async ({ data }) => {
    const { cleanPromoUrl } = await import("@/server/video/promo-link")
    const url = cleanPromoUrl(data.url)
    if (url === null) throw new Error("That isn't a web address. It starts with https:// or http://.")
    const settings = await import("@/server/video/settings")
    await settings.savePromoUrl(url)
    return { url }
  })

export function savePromoAddress(url: string): Promise<{ url: string }> {
  return saveUrlFn({ data: { url } })
}

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(300) }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.savePromoApiKey(data.apiKey)
    return settings.getPromoKeyStatus()
  })

export function savePromoKey(apiKey: string): Promise<SavedKeyStatus> {
  return saveKeyFn({ data: { apiKey } })
}

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    const settings = await import("@/server/video/settings")
    await settings.removePromoApiKey()
    return settings.getPromoKeyStatus()
  })

export function removePromoKey(): Promise<SavedKeyStatus> {
  return removeKeyFn()
}

/** Test: tells Promo this Video's address and says whose Promo answered. */
const testFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().max(300).optional() }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    const link = await import("@/server/video/promo-link")
    const url = await settings.getPromoUrl()
    if (!url) return { ok: false as const, message: "Fill in Promo's address first." }
    const key = data.apiKey?.trim() || (await settings.getPromoApiKey())
    if (!key) return { ok: false as const, message: "There is no key to test. Paste one first." }
    try {
      const answer = await link.helloPromo({ url, key })
      const count = answer.projects.length
      return {
        ok: true as const,
        message: `Connected to ${answer.name ? `${answer.name}'s ` : ""}Promo, with ${count} ${count === 1 ? "project" : "projects"}.`,
      }
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Promo didn't answer." }
    }
  })

export function testPromoKey(apiKey?: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  return testFn({ data: { apiKey } })
}

const projectsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ sourceProjectId: z.string().max(36).optional() }))
  .handler(async ({ context, data }) => {
    const link = await import("@/server/video/promo-link")
    const sends = await import("@/server/video/promo-sends")
    const projects = await link.listPromoProjects(await link.readPromoConnection())
    const picked = data.sourceProjectId ? await sends.readPicks(context.user.id, data.sourceProjectId) : []
    // A remembered project that has since gone from Promo is simply not picked (part 5).
    return { projects, picked: picked.filter((id) => projects.some((project) => project.id === id)) }
  })

/** Promo's projects, and the ones picked last time for this video or carousel project. */
export function loadPromoProjects(sourceProjectId?: string): Promise<{ projects: PromoProjectOption[]; picked: string[] }> {
  return projectsFn({ data: { sourceProjectId } })
}

const id = z.string().min(1).max(36)

const sendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      exportIds: z.array(id).max(MAX_PROMO_EXPORTS_PER_SEND).default([]),
      thumbnailIds: z.array(id).max(MAX_PROMO_EXPORTS_PER_SEND).default([]),
      promoProjects: z
        .array(z.object({ id: z.string().min(1).max(64), name: z.string().max(200) }))
        .min(1)
        .max(MAX_PROMO_PROJECTS_PER_SEND),
      drafts: z.array(z.enum(PROMO_DRAFT_NETWORKS)).max(PROMO_DRAFT_NETWORKS.length).default([]),
      withLanguageCopies: z.boolean().default(false),
      replace: z.record(z.string().max(120), z.string().max(64)).default({}),
      pdf: z.boolean().default(false),
      slideshow: z.object({ soundId: id.nullable() }).nullable().default(null),
    })
  )
  .handler(async ({ context, data }) => {
    await enforceRateLimit(`promo-send:${context.user.id}`, { maxAttempts: 60, windowSeconds: 3600 })
    const sends = await import("@/server/video/promo-sends")
    const copies = await import("@/server/video/promo-copies")
    const { exportIds, groupKeys, skipped } = data.withLanguageCopies
      ? await copies.withLanguageCopies(context.user.id, data.exportIds)
      : { exportIds: data.exportIds, groupKeys: {}, skipped: [] }
    const started = await sends.startPromoSends({
      userId: context.user.id,
      exportIds,
      thumbnailIds: data.thumbnailIds,
      promoProjects: data.promoProjects,
      drafts: data.drafts,
      replace: data.replace,
      groupKeys,
      pdf: data.pdf,
      slideshow: data.slideshow,
    })
    return { sends: started, skipped }
  })

export type SendToPromoInput = {
  exportIds?: string[]
  thumbnailIds?: string[]
  promoProjects: { id: string; name: string }[]
  drafts?: (typeof PROMO_DRAFT_NETWORKS)[number][]
  withLanguageCopies?: boolean
  replace?: Record<string, string>
  pdf?: boolean
  /** A carousel also as a slideshow video, with this music or none (part 15). */
  slideshow?: { soundId: string | null } | null
}

/** Starts the sends, and names any language copy left out because it has no export in that shape. */
export function sendToPromo(input: SendToPromoInput): Promise<{ sends: PromoSendView[]; skipped: string[] }> {
  return sendFn({ data: input as Required<SendToPromoInput> })
}

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ exportIds: z.array(id).max(200).default([]), thumbnailIds: z.array(id).max(200).default([]) }))
  .handler(async ({ context, data }) => {
    const sends = await import("@/server/video/promo-sends")
    return sends.listPromoSends(context.user.id, data)
  })

/** The newest send of each of these to each Promo project. */
export function loadPromoSends(ids: { exportIds?: string[]; thumbnailIds?: string[] }): Promise<PromoSendView[]> {
  return listFn({ data: { exportIds: ids.exportIds ?? [], thumbnailIds: ids.thumbnailIds ?? [] } })
}

const refreshFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ sendIds: z.array(id).max(200) }))
  .handler(async ({ context, data }) => {
    const sends = await import("@/server/video/promo-sends")
    return sends.refreshPromoSends(context.user.id, data.sendIds)
  })

/** Asks Promo how sends still on their way are doing. */
export function refreshPromoSends(sendIds: string[]): Promise<PromoSendView[]> {
  return refreshFn({ data: { sendIds } })
}

const retryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ sendId: id }))
  .handler(async ({ context, data }) => {
    const sends = await import("@/server/video/promo-sends")
    return sends.retryPromoSend(context.user.id, data.sendId)
  })

export function retryPromoSend(sendId: string): Promise<PromoSendView> {
  return retryFn({ data: { sendId } })
}

const targetFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ exportId: id.optional(), videoId: id.optional(), carouselId: id.optional() }))
  .handler(async ({ context, data }) => {
    const targets = await import("@/server/video/promo-targets")
    return targets.promoTargetFor(context.user.id, data)
  })

/**
 * What Send to Promo opens on: one export, or a video's or carousel's newest
 * finished export. Null when there is none yet.
 */
export function loadPromoTarget(which: { exportId?: string; videoId?: string; carouselId?: string }) {
  return targetFn({ data: which })
}
