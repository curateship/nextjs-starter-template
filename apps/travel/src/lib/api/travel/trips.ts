import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import {
  createActivitySchema,
  createTripSchema,
  dayInfoInputSchema,
  moveActivitySchema,
  updateActivitySchema,
  updateTripSchema,
} from "@/lib/travel/schemas"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import { giveSampleTrip } from "@/server/travel/sample"
import { pickTripCover } from "@/server/travel/trip-cover"
import { guessTripTimeZone } from "@/server/travel/trip-time-zone"
import { findTripOnToday } from "@/server/travel/trip-today"
import { markEndedTripsDone } from "@/server/travel/trip-admin"
import {
  binActivities,
  binTrip,
  createActivity,
  createTrip,
  emptyTripBin,
  loadTripPage,
  loadTripsPage,
  markActivitiesDone,
  moveActivity,
  purgeTrip,
  restoreTrip,
  setDayInfo,
  updateActivity,
  updateTrip,
} from "@/server/travel/trips"

export type {
  Activity,
  Trip,
  TripNote,
  TripListRow,
  TripPage,
  TripsPage,
} from "@/server/travel/trips"

const loadTripsPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    // A new person's first visit makes the Tokyo sample trip, once ever (task part 2).
    await giveSampleTrip(context.user.id)
    // A trip past its last day turns Done by itself (task part 36).
    await markEndedTripsDone(context.user.id)
    // A trip in the bin more than 30 days goes for good (Travel features part 8).
    await emptyTripBin(context.user.id)
    return loadTripsPage(context.user.id)
  })

const loadTripPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => loadTripPage(context.user.id, data.tripId))

const createTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTripSchema)
  .handler(async ({ data, context }) => {
    const made = await createTrip(context.user.id, data)
    // The top Unsplash photo of the destination, when there is one (Travel features part 9). Unsplash
    // allows few searches an hour, so past 30 new trips in 10 minutes the trip is made with no cover.
    const coverAllowed = await enforceRateLimit(`travel-trip-cover:${context.user.id}`, { maxAttempts: 30, windowSeconds: 10 * 60 })
      .then(() => true)
      .catch(() => false)
    if (coverAllowed) await pickTripCover(made.id, data.destination)
    await guessTripTimeZone(context.user.id, made.id)
    return made
  })

const updateTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTripSchema)
  .handler(async ({ data, context }) => {
    await updateTrip(context.user.id, data)
    if (data.destination !== undefined) await guessTripTimeZone(context.user.id, data.tripId)
  })

const binTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => binTrip(context.user.id, data.tripId))

const restoreTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => restoreTrip(context.user.id, data.tripId))

const purgeTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => purgeTrip(context.user.id, data.tripId))

const setDayInfoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(dayInfoInputSchema)
  .handler(async ({ data, context }) => setDayInfo(context.user.id, data))

const createActivityFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createActivitySchema)
  .handler(async ({ data, context }) => createActivity(context.user.id, data))

const updateActivityFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateActivitySchema)
  .handler(async ({ data, context }) => updateActivity(context.user.id, data))

const moveActivityFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(moveActivitySchema)
  .handler(async ({ data, context }) => moveActivity(context.user.id, data))

const binActivitiesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityIds: z.array(id).min(1).max(500) }))
  .handler(async ({ data, context }) => binActivities(context.user.id, data.activityIds))

const markDoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityIds: z.array(id).min(1).max(500), done: z.boolean() }))
  .handler(async ({ data, context }) => markActivitiesDone(context.user.id, data))

const tripOnTodayFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => findTripOnToday(context.user.id))

/** The id of the person's trip that's on today, or null (Travel features 4, part 8). */
export function loadTripOnToday() {
  return tripOnTodayFn()
}
export function loadTrips() {
  return loadTripsPageFn()
}
export function loadTrip(tripId: string) {
  return loadTripPageFn({ data: { tripId } })
}
export function makeTrip(data: z.input<typeof createTripSchema>) {
  return createTripFn({ data })
}
export function saveTrip(data: z.input<typeof updateTripSchema>) {
  return updateTripFn({ data })
}
/** Delete: the trip goes into the bin for 30 days (Travel features part 8). */
export function binTripById(tripId: string) {
  return binTripFn({ data: { tripId } })
}
/** Put back, from the bin. */
export function restoreTripById(tripId: string) {
  return restoreTripFn({ data: { tripId } })
}
/** Delete for good, from the bin. */
export function purgeTripById(tripId: string) {
  return purgeTripFn({ data: { tripId } })
}
export function saveDayInfo(data: z.input<typeof dayInfoInputSchema>) {
  return setDayInfoFn({ data })
}
export function makeActivity(data: z.input<typeof createActivitySchema>) {
  return createActivityFn({ data })
}
export function saveActivity(data: z.input<typeof updateActivitySchema>) {
  return updateActivityFn({ data })
}
export function placeActivity(data: z.input<typeof moveActivitySchema>) {
  return moveActivityFn({ data })
}
/** Mass select's Mark done or not done, in one request (More Travel features part 12). */
export function markActivityListDone(activityIds: string[], done: boolean) {
  return markDoneFn({ data: { activityIds, done } })
}
export function binActivityList(activityIds: string[]) {
  return binActivitiesFn({ data: { activityIds } })
}
