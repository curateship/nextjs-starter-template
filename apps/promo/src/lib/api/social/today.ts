import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet } from "@/server/guards"
import { readToday, type TodayView } from "@/server/social/today"

import { createErrorMessage } from "../error-message"

export type { TodayView }

/** The Today tab's one endpoint. Admin only, like every Promo endpoint. */

export const getTodayErrorMessage = createErrorMessage({}, "Today's list could not be read. Please try again.")

const todayFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<TodayView> => readToday(context.user.id, data.projectId))

/** One project's Strong fit posts and its replies waiting for an answer. */
export function loadToday(projectId: string) {
  return todayFn({ data: { projectId } })
}
