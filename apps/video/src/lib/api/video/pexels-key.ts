import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import type { SavedKeyStatus } from "@/server/video/settings"

export type { SavedKeyStatus }

/**
 * The Pexels key on Settings → Pexels, which the carousel's photo search uses.
 * Admin only, like the YouTube key.
 */

const describeKeyError = createErrorMessage(
  {
    EMPTY_KEY: "Paste a key first.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE: "The saved key can no longer be read. Paste it again.",
  },
  "That did not work. Try again in a moment."
)

export function getPexelsKeyErrorMessage(error: unknown) {
  return describeKeyError(error)
}

const loadKeyFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => import("@/server/video/settings").then((m) => m.getPexelsKeyStatus()))

export function loadPexelsKeyStatus(): Promise<SavedKeyStatus> {
  return loadKeyFn()
}

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.savePexelsApiKey(data.apiKey)
    return settings.getPexelsKeyStatus()
  })

export function savePexelsKey(apiKey: string): Promise<SavedKeyStatus> {
  return saveKeyFn({ data: { apiKey } })
}

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    const settings = await import("@/server/video/settings")
    await settings.removePexelsApiKey()
    return settings.getPexelsKeyStatus()
  })

export function removePexelsKey(): Promise<SavedKeyStatus> {
  return removeKeyFn()
}

/** Tests the typed key, or the saved one when nothing is typed. */
const testKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().max(200).optional() }))
  .handler(async ({ data }) => {
    const [settings, pexels] = await Promise.all([
      import("@/server/video/settings"),
      import("@/server/video/pexels"),
    ])
    const key = data.apiKey?.trim() || (await settings.getPexelsApiKey())
    if (!key) return { ok: false as const, message: "There is no key to test. Paste one first." }
    return pexels.testPexelsKey(key)
  })

export function testPexelsKey(apiKey?: string) {
  return testKeyFn({ data: { apiKey } })
}
