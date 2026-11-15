import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import { userPost } from "@/server/guards"
import {
  createTripNote,
  deleteTripNote,
  duplicateTripNote,
  pinTripNote,
  purgeTripNote,
  restoreTripNote,
  saveTripNote,
} from "@/server/travel/trip-notes"

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => createTripNote(context.user.id, data.tripId))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id, body: z.string().max(100_000, "That note is too long to save.") }))
  .handler(async ({ data, context }) => saveTripNote(context.user.id, data))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => deleteTripNote(context.user.id, data.noteId))

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => duplicateTripNote(context.user.id, data.noteId))

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => restoreTripNote(context.user.id, data.noteId))

const purgeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id }))
  .handler(async ({ data, context }) => purgeTripNote(context.user.id, data.noteId))

const pinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: id, pinned: z.boolean() }))
  .handler(async ({ data, context }) => pinTripNote(context.user.id, data))

export function copyNote(noteId: string) {
  return duplicateFn({ data: { noteId } })
}
export function newTripNote(tripId: string) {
  return createFn({ data: { tripId } })
}
export function saveNote(noteId: string, body: string) {
  return saveFn({ data: { noteId, body } })
}
/** Into the trip's bin (Travel features 4, part 6). */
export function removeNote(noteId: string) {
  return deleteFn({ data: { noteId } })
}
/** Back from the bin to the notes list. */
export function restoreNote(noteId: string) {
  return restoreFn({ data: { noteId } })
}
/** Out of the bin for good. */
export function purgeNote(noteId: string) {
  return purgeFn({ data: { noteId } })
}
/** Pins a note to the top of the list, or takes the pin off (Travel features 4, part 7). */
export function pinNote(noteId: string, pinned: boolean) {
  return pinFn({ data: { noteId, pinned } })
}
