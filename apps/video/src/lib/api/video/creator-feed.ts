import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet } from "@/server/guards"
import { loadFeedPage, loadFeedView } from "@/server/video/creators/feed"
import type { CreatorFeedScope, CreatorFeedView } from "@/lib/video/creators"

/**
 * The middle panel's reads.
 *
 * Narrowing asks the server again rather than sieving what is on screen: fifty
 * posts filtered down to one creator would show three of their forty.
 */

export const getCreatorFeedErrorMessage = createErrorMessage(
  {},
  "The feed could not be read. Try again in a moment."
)

const scopeSchema = z.object({
  folderId: z.string().min(1).max(36).nullable(),
  creatorId: z.string().min(1).max(36).nullable(),
})

const loadViewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(scopeSchema)
  .handler(
    async ({ data, context }): Promise<CreatorFeedView> =>
      loadFeedView(context.user.id, data)
  )

/** The newest page for a scope, plus how many posts the scope holds. */
export function loadCreatorFeedView(scope: CreatorFeedScope) {
  return loadViewFn({ data: scope })
}

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    scopeSchema.extend({
      /** The oldest post on screen; everything older comes back. */
      before: z.string().min(1).max(40),
    })
  )
  .handler(async ({ data, context }) =>
    loadFeedPage(
      context.user.id,
      { folderId: data.folderId, creatorId: data.creatorId },
      data.before
    )
  )

export function loadOlderCreatorPosts(scope: CreatorFeedScope, before: string) {
  return loadPageFn({ data: { ...scope, before } })
}
