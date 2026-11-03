import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { id } from "@/lib/travel/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { fillFromMapsLink } from "@/server/travel/maps-link"

const fillFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id, link: z.string().trim().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    // Each link costs a few Google calls, so one person can only fill so many.
    try {
      await enforceRateLimit(`travel-maps-link:${context.user.id}`, { maxAttempts: 60, windowSeconds: 10 * 60 })
    } catch (error) {
      if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(TRAVEL_ERRORS.tooManySearches)
      throw error
    }
    return fillFromMapsLink(context.user.id, data)
  })

/** Fills an activity's name, type, place, hours, website, phone and picture from a Google Maps link. */
export function fillActivityFromMapsLink(activityId: string, link: string) {
  return fillFn({ data: { activityId, link } })
}
