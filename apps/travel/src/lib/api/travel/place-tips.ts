import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { id } from "@/lib/travel/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { addPlaceTips } from "@/server/travel/place-tips"

const addTipsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id }))
  .handler(async ({ data, context }) => {
    try {
      await enforceRateLimit(`travel-place-tips:${context.user.id}`, { maxAttempts: 30, windowSeconds: 10 * 60 })
    } catch (error) {
      if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(TRAVEL_ERRORS.tooManySearches)
      throw error
    }
    return addPlaceTips(context.user.id, data)
  })

/** Asks the AI for 3 to 5 tips and adds them to the end of the card's notes (More Travel features part 5). */
export function addTips(activityId: string) {
  return addTipsFn({ data: { activityId } })
}
