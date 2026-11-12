import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id, photoCreditSchema, placeSchema } from "@/lib/travel/rules"
import { webAddress } from "@/lib/travel/schemas"
import { userGet, userPost } from "@/server/guards"
import {
  addGoAgainToTrip,
  addSavedPlaceToTrip,
  changeSavedPlaces,
  createSavedPlace,
  emptySavedPlacesBin,
  listGoAgain,
  listSavedPlaces,
  saveActivityAsPlace,
  updateSavedPlace,
  type SavedPlacePatch,
} from "@/server/travel/saved-places"

export type { GoAgainPlace, SavedPlace } from "@/server/travel/saved-places"

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ inBin: z.boolean() }))
  .handler(async ({ data, context }) => {
    // A place in the bin more than 30 days goes for good, as a trip does.
    if (data.inBin) await emptySavedPlacesBin(context.user.id)
    return listSavedPlaces(context.user.id, undefined, { inBin: data.inBin })
  })

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      title: z.string().trim().min(1, "Give the place a name.").max(200, "A place's name can be at most 200 characters."),
      typeId: id.nullable(),
      place: placeSchema.nullable(),
      website: webAddress.nullable(),
      phone: z.string().trim().max(40).nullable(),
    })
  )
  .handler(async ({ data, context }) => createSavedPlace(context.user.id, data))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id }))
  .handler(async ({ data, context }) => saveActivityAsPlace(context.user.id, data.activityId))

const updateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      savedPlaceId: id,
      title: z.string().trim().min(1, "Give the place a name.").max(200, "A place's name can be at most 200 characters.").optional(),
      typeId: id.nullable().optional(),
      notes: z.string().max(100_000, "Notes are too long to save.").optional(),
      photoUrl: z.string().max(1000).nullable().optional(),
      photoCredit: photoCreditSchema.nullable().optional(),
    })
  )
  .handler(async ({ data, context }) => updateSavedPlace(context.user.id, data))

const changeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids: z.array(id).min(1).max(500), change: z.enum(["bin", "restore", "purge"]) }))
  .handler(async ({ data, context }) => changeSavedPlaces(context.user.id, data))

/** The day a copy lands on: a day of the trip, or null for its Ideas column. */
const day = z.number().int().min(1).max(60).nullable().optional()

const addFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, savedPlaceId: id, day }))
  .handler(async ({ data, context }) => addSavedPlaceToTrip(context.user.id, data))

const listGoAgainFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listGoAgain(context.user.id))

const addGoAgainFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, activityId: id, day }))
  .handler(async ({ data, context }) => addGoAgainToTrip(context.user.id, data))

/** Every place ticked "Would go again", on any trip (More Travel features part 14). */
export function loadGoAgain() {
  return listGoAgainFn()
}
/** A copy of a Go again place on a trip: at the end of `day`, or in its Ideas when left out. */
export function addGoAgain(tripId: string, activityId: string, day?: number | null) {
  return addGoAgainFn({ data: { tripId, activityId, day } })
}
/** The saved places in use, or with `inBin` the ones in Places' bin. */
export function loadSavedPlaces({ inBin = false }: { inBin?: boolean } = {}) {
  return listFn({ data: { inBin } })
}
/** A new saved place, from the Places section's New place. */
export function makeSavedPlace(data: {
  title: string
  typeId: string | null
  place: z.input<typeof placeSchema> | null
  website: string | null
  phone: string | null
}) {
  return createFn({ data })
}
export function saveAsPlace(activityId: string) {
  return saveFn({ data: { activityId } })
}
/** Changes a saved place's name, type, notes or picture (Travel features 4, part 11). */
export function editSavedPlace(patch: SavedPlacePatch) {
  return updateFn({ data: patch })
}
/**
 * Into Places' bin, back out of it, or gone for good from it, in one request
 * however many are ticked. Answers with the ids changed and the ids skipped.
 */
export function changeSavedPlaceList(ids: string[], change: "bin" | "restore" | "purge") {
  return changeFn({ data: { ids, change } })
}
/** A copy of a saved place on a trip: at the end of `day`, or in its Ideas when left out. */
export function addSavedPlace(tripId: string, savedPlaceId: string, day?: number | null) {
  return addFn({ data: { tripId, savedPlaceId, day } })
}
