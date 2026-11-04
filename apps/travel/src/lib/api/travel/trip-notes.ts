import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import { userPost } from "@/server/guards"
import { createTripNote, deleteTripNote, duplicateTripNote, saveTripNote } from "@/server/travel/trip-notes"

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

export function copyNote(noteId: string) {
  return duplicateFn({ data: { noteId } })
}
export function newTripNote(tripId: string) {
  return createFn({ data: { tripId } })
}
export function saveNote(noteId: string, body: string) {
  return saveFn({ data: { noteId, body } })
}
export function removeNote(noteId: string) {
  return deleteFn({ data: { noteId } })
}
