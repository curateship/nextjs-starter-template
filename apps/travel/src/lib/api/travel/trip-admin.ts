import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRIP_NAME_MAX, id } from "@/lib/travel/rules"
import { userGet, userPost } from "@/server/guards"
import {
  copyTrip,
  deleteFromBin,
  listBin,
  loadTripPins,
  loadVisitedPins,
  restoreFromBin,
  setTripArchived,
} from "@/server/travel/trip-admin"
import { listNoteBin } from "@/server/travel/trip-notes"

export type { BinEntry, TripPin, VisitedPin } from "@/server/travel/trip-admin"
export type { BinNote } from "@/server/travel/trip-notes"

const archiveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, archived: z.boolean() }))
  .handler(async ({ data, context }) => setTripArchived(context.user.id, data.tripId, data.archived))

const copyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      tripId: id,
      name: z
        .string()
        .trim()
        .min(1, "Give the copy a name.")
        .max(TRIP_NAME_MAX, `A trip's name can be at most ${TRIP_NAME_MAX} characters.`),
    })
  )
  .handler(async ({ data, context }) => copyTrip(context.user.id, data))

const binFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => {
    // Deleted notes wait in the same bin as deleted cards (Travel features 4, part 6).
    const [activities, notes] = await Promise.all([listBin(context.user.id, data.tripId), listNoteBin(context.user.id, data.tripId)])
    return { activities, notes }
  })

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id }))
  .handler(async ({ data, context }) => restoreFromBin(context.user.id, data.activityId))

const purgeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id }))
  .handler(async ({ data, context }) => deleteFromBin(context.user.id, data.activityId))

const pinsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadTripPins(context.user.id))

const visitedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadVisitedPins(context.user.id))

export function archiveTrip(tripId: string, archived: boolean) {
  return archiveFn({ data: { tripId, archived } })
}
export function copyTripAs(tripId: string, name: string) {
  return copyFn({ data: { tripId, name } })
}
export function loadBin(tripId: string) {
  return binFn({ data: { tripId } })
}
export function restoreActivity(activityId: string) {
  return restoreFn({ data: { activityId } })
}
export function purgeActivity(activityId: string) {
  return purgeFn({ data: { activityId } })
}
export function loadPins() {
  return pinsFn()
}
/** Every place marked Done on the person's trips, for Places I've been (Travel features 3, part 12). */
export function loadVisited() {
  return visitedFn()
}
