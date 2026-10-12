import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  readBehaviourView,
  saveBehaviour,
  type BehaviourAccount,
  type BehaviourSettings,
  type BehaviourView,
} from "@/server/social/behaviour"
import { BEHAVIOUR_RANGES } from "@/lib/social/options"

import { createErrorMessage } from "../error-message"

export type { BehaviourAccount, BehaviourSettings, BehaviourView }

/**
 * Settings → Behaviour: the reader browser, waking hours, warm-up and pace,
 * for every account. Admin-only, like every Promo setting.
 */

export const getBehaviourErrorMessage = createErrorMessage(
  {
    "holds an account": "That profile holds an account, so it cannot be the reader. A reader is signed in to nobody.",
    "different times": "Waking hours have to start and end at different times.",
    "does not exist": "That browser profile has been deleted. Reload the page.",
  },
  "That did not save. Please try again."
)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<BehaviourView> => readBehaviourView(context.user.id))

export function loadBehaviour() {
  return loadFn()
}

const whole = (range: { min: number; max: number }) => z.number().int().min(range.min).max(range.max)

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      readerProfileId: z.string().min(1).max(36).nullable(),
      wakeFromMinute: whole(BEHAVIOUR_RANGES.wakeFromMinute),
      wakeUntilMinute: whole(BEHAVIOUR_RANGES.wakeUntilMinute),
      warmUpDays: whole(BEHAVIOUR_RANGES.warmUpDays),
      youngDays: whole(BEHAVIOUR_RANGES.youngDays),
      youngPerHour: whole(BEHAVIOUR_RANGES.youngPerHour),
      youngPerDay: whole(BEHAVIOUR_RANGES.youngPerDay),
      warnPerHour: whole(BEHAVIOUR_RANGES.warnPerHour),
    })
  )
  .handler(async ({ context, data }): Promise<BehaviourView> => {
    await saveBehaviour(context.user.id, data)
    return readBehaviourView(context.user.id)
  })

export function saveBehaviourFn(settings: BehaviourSettings) {
  return saveFn({ data: settings })
}
