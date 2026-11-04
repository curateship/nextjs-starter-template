import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import { userGet, userPost } from "@/server/guards"
import {
  addGoAgainToTrip,
  addSavedPlaceToTrip,
  deleteSavedPlace,
  listGoAgain,
  listSavedPlaces,
  saveActivityAsPlace,
} from "@/server/travel/saved-places"

export type { GoAgainPlace, SavedPlace } from "@/server/travel/saved-places"

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

const listGoAgainFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listGoAgain(context.user.id))

const addGoAgainFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, activityId: id }))
  .handler(async ({ data, context }) => addGoAgainToTrip(context.user.id, data))

/** Every place ticked "Would go again", on any trip (More Travel features part 14). */
export function loadGoAgain() {
  return listGoAgainFn()
}
/** A copy of a Go again place in a trip's Ideas. */
export function addGoAgain(tripId: string, activityId: string) {
  return addGoAgainFn({ data: { tripId, activityId } })
}
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
