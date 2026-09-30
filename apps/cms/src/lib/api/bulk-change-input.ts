import { z } from "zod"

/**
 * What an action bar may send, checked one piece per action so a dashboard can
 * only be asked for a change its records actually have.
 *
 * Deals have no categories and no featured flag, and only events have a free
 * featured switch, so each screen's door is built from the pieces that screen
 * offers rather than from one union that accepts everything.
 */

export const statusChangeInput = z.object({
  kind: z.literal("status"),
  status: z.enum(["draft", "published"]),
})

export const categoryChangeInput = z.object({
  kind: z.literal("category"),
  categoryId: z.string().min(1).max(36),
  mode: z.enum(["add", "replace"]),
})

export const featuredChangeInput = z.object({
  kind: z.literal("featured"),
  featured: z.boolean(),
})

/** The ids a dashboard may send in one request, the same cap Delete uses. */
export const bulkIdsInput = z.array(z.string().min(1).max(36)).min(1).max(500)
