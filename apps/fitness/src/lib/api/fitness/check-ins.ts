import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { markCheckInsSeen, saveCheckIn } from "@/server/fitness/check-ins"

export type { CheckIn } from "@/server/fitness/check-ins"

const score = z.number().int().min(1).max(5).nullable()

/** The person's weekly check-in for their coach. Sending again in the same week replaces it. */
const sendCheckInFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      weightKg: z.number().min(20).max(400).nullable(),
      sleep: score,
      stress: score,
      training: score,
      note: z.string().max(1000),
    })
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`fitness-check-in:${context.user.id}`, { maxAttempts: 10, windowSeconds: 60 * 60 })
    await saveCheckIn(context.user.id, data)
  })

export function sendCheckIn(data: Parameters<typeof sendCheckInFn>[0]["data"]) {
  return sendCheckInFn({ data })
}

/** A coach has the client's check-ins on screen, so the Clients table's New mark goes. */
const seenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ clientId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => markCheckInsSeen(context.user.id, data.clientId))

export function checkInsSeen(clientId: string) {
  return seenFn({ data: { clientId } })
}
