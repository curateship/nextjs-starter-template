import { createServerFn } from "@tanstack/react-start"

import { adminGet, adminPost } from "@/server/guards"
import type { ViralKeyView } from "@/server/video/viral-link/link"

import { createErrorMessage } from "../error-message"

export type { ViralKeyView }

/**
 * Settings → Viral: the key the Viral app sends drafts into Video with
 * (`workspace/docs/viral-connection.md`). Admin only. Each admin has their
 * own key, and drafts sent with it land in their projects.
 */

export const getViralKeyErrorMessage = createErrorMessage(
  {
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so the key cannot be kept. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE: "The saved key can no longer be read. Make a new one.",
  },
  "That did not work. Please try again."
)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => (await import("@/server/video/viral-link/link")).readViralKey(context.user.id))

export function loadViralKey(): Promise<ViralKeyView> {
  return loadFn()
}

const makeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }) => {
    const link = await import("@/server/video/viral-link/link")
    await link.makeViralKey(context.user.id)
    return link.readViralKey(context.user.id)
  })

/** A new key. The old one stops working at once. */
export function makeNewViralKey(): Promise<ViralKeyView> {
  return makeFn()
}
