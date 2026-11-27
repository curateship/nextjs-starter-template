import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet } from "@/server/guards"
import type { ViralRedditStart } from "@/server/viral-link/posts"

export type { ViralRedditStart }

/**
 * What a project's page reads of the posts Research leaves in Promo
 * (`workspace/docs/viral-link.md`). In Content the link between the two sets
 * itself up (`workspace/docs/content-app.md`).
 */

const redditDraftFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ draftId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }) => (await import("@/server/viral-link/posts")).viralRedditDraft(context.user.id, data.draftId))

/** A Reddit post Viral wrote, for New post to open with. Null when there is none. */
export function loadViralRedditDraft(draftId: string): Promise<ViralRedditStart | null> {
  return redditDraftFn({ data: { draftId } })
}
