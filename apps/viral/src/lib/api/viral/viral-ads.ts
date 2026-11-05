import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ProjectAds, WinningAd } from "@/lib/viral/ads"
import { adminGet, adminPost } from "@/server/guards"
import { fetchMetaAds, loadProjectAds, searchProjectAds } from "@/server/viral/meta-ads"
import { getMetaToken, getMetaTokenStatus, removeMetaToken, saveMetaToken } from "@/server/viral/settings"

/**
 * Winning ads (`workspace/docs/winning-ads.md`) and the Meta token behind
 * them on Settings → Meta. Admin only. The token never leaves the server;
 * the browser sees its last four characters.
 */

export type { ProjectAds, WinningAd }

const projectId = z.object({ projectId: z.string().min(1).max(36) })

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(projectId)
  .handler(async ({ data, context }): Promise<ProjectAds> => loadProjectAds(context.user.id, data.projectId))

export function loadProjectAdsFn(id: string) {
  return loadFn({ data: { projectId: id } })
}

const searchFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(projectId)
  .handler(async ({ data, context }): Promise<ProjectAds> => searchProjectAds(context.user.id, data.projectId))

/** Search ads: asks Meta's ad library about the project's keywords. */
export function searchProjectAdsFn(id: string) {
  return searchFn({ data: { projectId: id } })
}

const statusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => getMetaTokenStatus())

export function loadMetaTokenStatus() {
  return statusFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(1_000) }))
  .handler(async ({ data }) => {
    await saveMetaToken(data.apiKey)
    return getMetaTokenStatus()
  })

export function saveMetaTokenFn(apiKey: string) {
  return saveFn({ data: { apiKey } })
}

const removeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    await removeMetaToken()
    return getMetaTokenStatus()
  })

export function removeMetaTokenFn() {
  return removeFn()
}

const testFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().max(1_000).optional() }))
  .handler(async ({ data }): Promise<{ ok: true; message: string } | { ok: false; message: string }> => {
    const token = data.apiKey?.trim() || (await getMetaToken())
    if (!token) return { ok: false, message: "There is no token to test. Paste one first." }
    try {
      const ads = await fetchMetaAds(token, "coffee")
      return { ok: true, message: `Meta answered with ${ads.length} running ads for "coffee". Winning ads works.` }
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^.*VIRAL_SAYS: /, "") : "The test failed."
      return { ok: false, message }
    }
  })

/** Test on Settings → Meta: one question to the ad library with the token. */
export function testMetaTokenFn(apiKey?: string) {
  return testFn({ data: { apiKey } })
}
