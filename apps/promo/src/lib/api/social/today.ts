import { createServerFn } from "@tanstack/react-start"

import { adminGet } from "@/server/guards"
import { readToday, type TodayView } from "@/server/social/today"

import { createErrorMessage } from "../error-message"

export type { TodayView }

/** The Today page's one endpoint. Admin only, like every Promo endpoint. */

export const getTodayErrorMessage = createErrorMessage({}, "Today's list could not be read. Please try again.")

const todayFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<TodayView> => readToday(context.user.id))

/** Every project's Strong fit posts and every reply waiting for an answer. */
export function loadToday() {
  return todayFn()
}
