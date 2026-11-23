import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { TIDY_DAYS_RANGE } from "@/lib/social/options"
import { readTidyAfterDays, saveTidyAfterDays } from "@/server/social/tidy"

import { createErrorMessage } from "../../error-message"

/**
 * The one number the regular tidy-up of old posts reads, on Settings →
 * Reddit account. Admin only.
 */

// The card checks the number before saving, so a refusal here is rare.
export const getTidyErrorMessage = createErrorMessage({}, "That did not save. Please try again.")

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<number> => readTidyAfterDays(context.user.id))

export function loadTidyAfterDays() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ days: z.number().int().min(TIDY_DAYS_RANGE.min).max(TIDY_DAYS_RANGE.max) })
  )
  .handler(async ({ context, data }): Promise<number> =>
    saveTidyAfterDays(context.user.id, data.days)
  )

export function saveTidyAfterDaysFn(days: number) {
  return saveFn({ data: { days } })
}
