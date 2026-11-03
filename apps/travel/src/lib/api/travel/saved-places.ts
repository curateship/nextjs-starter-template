import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import { userGet, userPost } from "@/server/guards"
import {
  addSavedPlaceToTrip,
  deleteSavedPlace,
  listSavedPlaces,
  saveActivityAsPlace,
} from "@/server/travel/saved-places"

export type { SavedPlace } from "@/server/travel/saved-places"

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listSavedPlaces(context.user.id))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id }))
  .handler(async ({ data, context }) => saveActivityAsPlace(context.user.id, data.activityId))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ savedPlaceId: id }))
  .handler(async ({ data, context }) => deleteSavedPlace(context.user.id, data.savedPlaceId))

const addFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, savedPlaceId: id }))
  .handler(async ({ data, context }) => addSavedPlaceToTrip(context.user.id, data))

export function loadSavedPlaces() {
  return listFn()
}
export function saveAsPlace(activityId: string) {
  return saveFn({ data: { activityId } })
}
export function forgetSavedPlace(savedPlaceId: string) {
  return deleteFn({ data: { savedPlaceId } })
}
export function addSavedPlace(tripId: string, savedPlaceId: string) {
  return addFn({ data: { tripId, savedPlaceId } })
}
