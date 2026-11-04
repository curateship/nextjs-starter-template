import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { id } from "@/lib/travel/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { addActivityFromMapsLink, fillFromMapsLink } from "@/server/travel/maps-link"

const link = z.string().trim().min(1).max(2000)

/** Each link costs a few Google calls or a hidden browser's minute, so one person can only fill so many. */
async function limitFills(userId: string) {
  try {
    await enforceRateLimit(`travel-maps-link:${userId}`, { maxAttempts: 60, windowSeconds: 10 * 60 })
  } catch (error) {
    if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(TRAVEL_ERRORS.tooManySearches)
    throw error
  }
}

const fillFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id, link }))
  .handler(async ({ data, context }) => {
    await limitFills(context.user.id)
    return fillFromMapsLink(context.user.id, data)
  })

// The same allowance as filling one activity: a paste of 20 links is 20 fills.
const addFromLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, link }))
  .handler(async ({ data, context }) => {
    await limitFills(context.user.id)
    return addActivityFromMapsLink(context.user.id, data)
  })

/** Fills an activity's name, type, place, hours, website, phone and picture from a Google Maps link. */
export function fillActivityFromMapsLink(activityId: string, link: string) {
  return fillFn({ data: { activityId, link } })
}

/** One link of a Paste Maps links paste: a new card in Ideas, filled from it. A link that can't be read makes none. */
export function addActivityFromLink(tripId: string, link: string) {
  return addFromLinkFn({ data: { tripId, link } })
}
