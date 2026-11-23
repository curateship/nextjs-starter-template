import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import type { ViralRedditStart } from "@/server/viral-link/posts"
import type { ViralKeyView } from "@/server/viral-link/link"

import { createErrorMessage } from "../error-message"

export type { ViralKeyView, ViralRedditStart }

/**
 * Settings → Viral: the key the Viral app reads X, LinkedIn and Reddit
 * through Promo with, and leaves posts in Promo with
 * (`workspace/docs/viral-link.md`). Admin only. Each admin has their own key,
 * and reads run on their search accounts and reader.
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
  .handler(async ({ context }) => (await import("@/server/viral-link/link")).readViralKey(context.user.id))

export function loadViralKey(): Promise<ViralKeyView> {
  return loadFn()
}

const makeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }) => {
    const link = await import("@/server/viral-link/link")
    await link.makeViralKey(context.user.id)
    return link.readViralKey(context.user.id)
  })

/** A new key. The old one stops working at once. */
export function makeNewViralKey(): Promise<ViralKeyView> {
  return makeFn()
}

const redditDraftFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ draftId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }) => (await import("@/server/viral-link/posts")).viralRedditDraft(context.user.id, data.draftId))

/** A Reddit post Viral wrote, for New post to open with. Null when there is none. */
export function loadViralRedditDraft(draftId: string): Promise<ViralRedditStart | null> {
  return redditDraftFn({ data: { draftId } })
}
