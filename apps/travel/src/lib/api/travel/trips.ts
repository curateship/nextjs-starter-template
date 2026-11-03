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
import { userGet, userPost } from "@/server/guards"
import { giveSampleTrip } from "@/server/travel/sample"
import { markEndedTripsDone } from "@/server/travel/trip-admin"
import {
  binActivities,
  createActivity,
  createTrip,
  deleteTrip,
  loadTripPage,
  loadTripsPage,
  moveActivity,
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
    return loadTripsPage(context.user.id)
  })

const loadTripPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => loadTripPage(context.user.id, data.tripId))

const createTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTripSchema)
  .handler(async ({ data, context }) => createTrip(context.user.id, data))

const updateTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTripSchema)
  .handler(async ({ data, context }) => updateTrip(context.user.id, data))

const deleteTripFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => deleteTrip(context.user.id, data.tripId))

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
export function removeTrip(tripId: string) {
  return deleteTripFn({ data: { tripId } })
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
export function binActivityList(activityIds: string[]) {
  return binActivitiesFn({ data: { activityIds } })
}
