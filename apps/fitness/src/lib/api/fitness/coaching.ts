import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import {
  answerCoach,
  clientName,
  inviteClient,
  removeClients,
  removeCoach,
  setCoachPhotos,
} from "@/server/fitness/coach"
import { noticeLinks } from "@/server/fitness/notices"

export type { CoachClient, MyCoach } from "@/server/fitness/coach"

const id = z.string().min(1).max(36)

const clientNameFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ clientId: id }))
  .handler(async ({ data, context }) => clientName(context.user.id, data.clientId))

export function loadClientName(clientId: string) {
  return clientNameFn({ data: { clientId } })
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

/** Where each of the person's Fitness notices leads, for the bell. */
const noticeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ ids: z.array(id).max(100) }))
  .handler(async ({ data, context }) => noticeLinks(context.user.id, data.ids))

export function loadFitnessNoticeLinks(ids: string[]) {
  return noticeFn({ data: { ids } })
}
