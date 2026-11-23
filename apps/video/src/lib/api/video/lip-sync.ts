import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  LIP_SYNC_FAILED_MESSAGE,
  LIP_SYNC_KEY_MESSAGE,
  LIP_SYNC_NO_VOICE_MESSAGE,
  LIP_SYNC_NOT_FOUND_MESSAGE,
  LIP_SYNC_NOT_VIDEO_MESSAGE,
  LIP_SYNC_SPEED_MESSAGE,
  LIP_SYNC_TOO_LONG_MESSAGE,
  LIP_SYNC_TOO_SHORT_MESSAGE,
} from "@/lib/video/lip-sync"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import type { LipSyncView } from "@/server/video/lip-sync"
import type { SavedKeyStatus } from "@/server/video/settings"

export type { LipSyncView }

/**
 * Making a clip's lips match a new voice with Sync Labs (lip-sync.md), and the
 * Sync Labs key on Settings → Lip sync. Matching is the signed-in owner's: a
 * guest sent from Project uses no AI outside the Thumbnail section, and the
 * editor never offers it to one. The key is admin only, like the Pexels key.
 */

const KNOWN_MESSAGES = new Set([
  LIP_SYNC_FAILED_MESSAGE,
  LIP_SYNC_KEY_MESSAGE,
  LIP_SYNC_NO_VOICE_MESSAGE,
  LIP_SYNC_NOT_FOUND_MESSAGE,
  LIP_SYNC_NOT_VIDEO_MESSAGE,
  LIP_SYNC_SPEED_MESSAGE,
  LIP_SYNC_TOO_LONG_MESSAGE,
  LIP_SYNC_TOO_SHORT_MESSAGE,
])

export function getLipSyncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message.includes("AI_LIMIT_REACHED")) return "Your monthly AI allowance is used up."
  if (message.includes("RATE_LIMITED")) return "That's a lot of lip matching at once. Wait a while and try again."
  return getAiToolErrorMessage(error)
}

const ids = {
  videoId: z.string().min(1).max(36),
  clipId: z.string().min(1).max(64),
}

const startFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ...ids, soundClipId: z.string().min(1).max(64) }))
  .handler(async ({ data, context }) => {
    // Each start sends a paid job to Sync; 20 an hour is far past real use.
    await enforceRateLimit(`lip-sync:${context.user.id}`, { maxAttempts: 20, windowSeconds: 3600 })
    const lipSync = await import("@/server/video/lip-sync")
    return lipSync.startLipSync({ userId: context.user.id, ...data })
  })

const latestFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(ids))
  .handler(({ data, context }) =>
    import("@/server/video/lip-sync").then((m) =>
      m.latestLipSync(context.user.id, data.videoId, data.clipId)
    )
  )

const checkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ jobId: z.string().min(1).max(36) }))
  .handler(({ data, context }) =>
    import("@/server/video/lip-sync").then((m) => m.checkLipSync(context.user.id, data.jobId))
  )

export function startLipSync(videoId: string, clipId: string, soundClipId: string): Promise<LipSyncView> {
  return startFn({ data: { videoId, clipId, soundClipId } })
}

export function loadLatestLipSync(videoId: string, clipId: string): Promise<LipSyncView | null> {
  return latestFn({ data: { videoId, clipId } })
}

export function checkLipSync(jobId: string): Promise<LipSyncView> {
  return checkFn({ data: { jobId } })
}

// --- The key ---------------------------------------------------------------------

const describeKeyError = createErrorMessage(
  {
    EMPTY_KEY: "Paste a key first.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE: "The saved key can no longer be read. Paste it again.",
  },
  "That did not work. Try again in a moment."
)

export function getSyncKeyErrorMessage(error: unknown) {
  return describeKeyError(error)
}

const loadKeyFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => import("@/server/video/settings").then((m) => m.getSyncKeyStatus()))

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(300) }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    await settings.saveSyncApiKey(data.apiKey)
    return settings.getSyncKeyStatus()
  })

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    const settings = await import("@/server/video/settings")
    await settings.removeSyncApiKey()
    return settings.getSyncKeyStatus()
  })

/** Asks Sync Labs which models the key can use, which costs nothing. */
const testKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().max(300).optional() }))
  .handler(async ({ data }) => {
    const settings = await import("@/server/video/settings")
    const key = data.apiKey?.trim() || (await settings.getSyncApiKey())
    if (!key) return { ok: false as const, message: "There is no key to test. Paste one first." }
    try {
      const response = await fetch("https://api.sync.so/v2/models", {
        headers: { "x-api-key": key },
        signal: AbortSignal.timeout(15_000),
      })
      if (response.status === 401 || response.status === 403) {
        return { ok: false as const, message: "Sync Labs turned the key down. Check it was copied whole." }
      }
      if (!response.ok) return { ok: false as const, message: "Sync Labs didn't answer. Try again in a moment." }
      return { ok: true as const }
    } catch {
      return { ok: false as const, message: "Sync Labs couldn't be reached. Try again in a moment." }
    }
  })

export function loadSyncKeyStatus(): Promise<SavedKeyStatus> {
  return loadKeyFn()
}

export function saveSyncKey(apiKey: string): Promise<SavedKeyStatus> {
  return saveKeyFn({ data: { apiKey } })
}

export function removeSyncKey(): Promise<SavedKeyStatus> {
  return removeKeyFn()
}

export function testSyncKey(apiKey?: string) {
  return testKeyFn({ data: { apiKey } })
}
