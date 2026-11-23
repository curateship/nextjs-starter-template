import { createServerFn } from "@tanstack/react-start"

import { adminGet, adminPost } from "@/server/guards"
import type { VideoKeyView } from "@/server/archive/video-link"

import { createErrorMessage } from "../error-message"

export type { VideoKeyView }

/**
 * Settings → Video: the key the Video app sends things into the Archive
 * with (`workspace/docs/archive.md`). Admin only. Each admin has their own
 * key, and things sent with it land in their projects.
 */

export const getVideoKeyErrorMessage = createErrorMessage(
  {
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so the key cannot be kept. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE: "The saved key can no longer be read. Make a new one.",
  },
  "That did not work. Please try again."
)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => (await import("@/server/archive/video-link")).readVideoKey(context.user.id))

export function loadVideoKey(): Promise<VideoKeyView> {
  return loadFn()
}

const makeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }) => {
    const link = await import("@/server/archive/video-link")
    await link.makeVideoKey(context.user.id)
    return link.readVideoKey(context.user.id)
  })

/** A new key. The old one stops working at once. */
export function makeNewVideoKey(): Promise<VideoKeyView> {
  return makeFn()
}
