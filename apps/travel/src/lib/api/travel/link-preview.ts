import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { loadLinkPreview } from "@/server/travel/link-preview"

/**
 * Each read fetches a page someone named, so one person gets 60 in 10 minutes:
 * plenty for writing notes, and a stop on using the server to visit addresses.
 */
const readLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ url: z.string().trim().min(1).max(1000) }))
  .handler(async ({ data, context }) => {
    try {
      await enforceRateLimit(`travel-link-preview:${context.user.id}`, { maxAttempts: 60, windowSeconds: 10 * 60 })
    } catch (error) {
      if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(TRAVEL_ERRORS.tooManySearches)
      throw error
    }
    return loadLinkPreview(data.url)
  })

/** A pasted web page's title, picture and site name, for a Link block (Travel features 4, part 5). */
export function readLink(url: string) {
  return readLinkFn({ data: { url } })
}
