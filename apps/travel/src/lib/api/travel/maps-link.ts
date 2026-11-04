import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { id, MAX_TRIP_DAYS, TIME_PATTERN } from "@/lib/travel/rules"
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

// New activity with a link: the card is made on its day, and kept to fill by hand when the link can't be read.
const makeFromLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      tripId: id,
      link,
      day: z.number().int().min(1).max(MAX_TRIP_DAYS).nullable(),
      title: z.string().trim().max(200),
      typeId: id.nullable(),
      startTime: z.string().regex(TIME_PATTERN).nullable(),
    })
  )
  .handler(async ({ data, context }) => {
    await limitFills(context.user.id)
    return addActivityFromMapsLink(context.user.id, data, undefined, { keepOnFailure: true })
  })

/** Fills an activity's name, type, place, hours, website, phone and picture from a Google Maps link. */
export function fillActivityFromMapsLink(activityId: string, link: string) {
  return fillFn({ data: { activityId, link } })
}

/** One link of a Paste Maps links paste: a new card in Ideas, filled from it. A link that can't be read makes none. */
export function addActivityFromLink(tripId: string, link: string) {
  return addFromLinkFn({ data: { tripId, link } })
}

/**
 * New activity with a Google Maps link: a card on the day picked, filled from
 * the link. One whose link can't be read is still made, with the name typed,
 * and `failed` says why. A place already on the trip makes none.
 */
export function makeActivityFromLink(input: {
  tripId: string
  link: string
  day: number | null
  title: string
  typeId: string | null
  startTime: string | null
}) {
  return makeFromLinkFn({ data: input })
}
