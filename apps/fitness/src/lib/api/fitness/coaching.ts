import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import {
  answerCoach,
  clientName,
  inviteClient,
  linkedClients,
  removeClients,
  removeCoach,
  setCoachPhotos,
} from "@/server/fitness/coach"
import { deleteCoachNote, loadCoachNotes, saveCoachNote } from "@/server/fitness/coach-notes"
import { noticeLinks } from "@/server/fitness/notices"
import { copyProgramToClient } from "@/server/fitness/sharing"

export type { CoachClient, MyCoach } from "@/server/fitness/coach"
export type { CoachNote, LiftNote } from "@/server/fitness/coach-notes"

const id = z.string().min(1).max(36)

const clientNameFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ clientId: id }))
  .handler(async ({ data, context }) => clientName(context.user.id, data.clientId))

export function loadClientName(clientId: string) {
  return clientNameFn({ data: { clientId } })
}

const linkedClientsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => linkedClients(context.user.id))

/** A coach's clients who said yes, by name. */
export function loadLinkedClients() {
  return linkedClientsFn()
}

/** Copies one of the coach's own programs into the account of a client who said yes. */
const copyToClientFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ programId: id, clientId: id }))
  // Only a coach has clients who said yes, so the link check is the coach check.
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`fitness-copy:${context.user.id}`, { maxAttempts: 30, windowSeconds: 60 * 60 })
    return copyProgramToClient(context.user.id, data.programId, data.clientId)
  })

export function copyToClient(programId: string, clientId: string) {
  return copyToClientFn({ data: { programId, clientId } })
}

const coachFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("invite"), email: z.string().email().max(255) }),
      z.object({ action: z.literal("removeClients"), clientIds: z.array(id).min(1).max(100) }),
    ])
  )
  .handler(async ({ data, context }): Promise<{ done: string[]; kept: string[] }> => {
    if (data.action === "removeClients") return removeClients(context.user.id, data.clientIds)
    await enforceRateLimit(`fitness-invite:${context.user.id}`, { maxAttempts: 20, windowSeconds: 60 * 60 })
    await inviteClient(context.user.id, data.email)
    return { done: [], kept: [] }
  })

export function changeClients(data: Parameters<typeof coachFn>[0]["data"]) {
  return coachFn({ data })
}

const myCoachFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("answer"), coachId: id, accept: z.boolean() }),
      z.object({ action: z.literal("photos"), coachId: id, allowed: z.boolean() }),
      z.object({ action: z.literal("remove"), coachId: id }),
    ])
  )
  .handler(async ({ data, context }) => {
    if (data.action === "answer") await answerCoach(context.user.id, data.coachId, data.accept)
    else if (data.action === "photos") await setCoachPhotos(context.user.id, data.coachId, data.allowed)
    else await removeCoach(context.user.id, data.coachId)
  })

export function changeMyCoach(data: Parameters<typeof myCoachFn>[0]["data"]) {
  return myCoachFn({ data })
}

/**
 * A coach's note on a client's finished workout, or on one lift in it, and
 * deleting one of their own. Answers with the workout's notes as they now are.
 */
const coachNoteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({
        action: z.literal("save"),
        workoutId: id,
        position: z.number().int().min(0).max(200).nullable(),
        text: z.string().max(1000),
      }),
      z.object({ action: z.literal("delete"), workoutId: id, noteId: id }),
    ])
  )
  .handler(async ({ data, context }) => {
    // Deletes count too, so deleting and writing a note again can't fill the client's bell.
    await enforceRateLimit(`fitness-coach-note:${context.user.id}`, { maxAttempts: 120, windowSeconds: 60 * 60 })
    if (data.action === "save") await saveCoachNote(context.user.id, data)
    else await deleteCoachNote(context.user.id, data.noteId)
    return loadCoachNotes(context.user.id, data.workoutId)
  })

export function changeCoachNote(data: Parameters<typeof coachNoteFn>[0]["data"]) {
  return coachNoteFn({ data })
}

/** Where each of the person's Fitness notices leads, for the bell. */
const noticeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ ids: z.array(id).max(100) }))
  .handler(async ({ data, context }) => noticeLinks(context.user.id, data.ids))

export function loadFitnessNoticeLinks(ids: string[]) {
  return noticeFn({ data: { ids } })
}
