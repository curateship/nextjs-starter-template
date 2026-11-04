import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRIP_NAME_MAX, id } from "@/lib/travel/rules"
import { userGet, userPost } from "@/server/guards"
import {
  copyTrip,
  deleteFromBin,
  listBin,
  loadTripPins,
  restoreFromBin,
  setTripArchived,
} from "@/server/travel/trip-admin"

export type { BinEntry, TripPin } from "@/server/travel/trip-admin"

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
  .handler(async ({ data, context }) => listBin(context.user.id, data.tripId))

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
