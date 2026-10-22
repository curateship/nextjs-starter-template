import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { editorGet } from "@/server/social/editor-guards"
import { actorFor } from "@/server/social/project-guests"
import { readToday, type TodayView } from "@/server/social/today"

import { createErrorMessage } from "../error-message"

export type { TodayView }

/** The Today tab's one endpoint. Admin only, like every Promo endpoint. */

export const getTodayErrorMessage = createErrorMessage({}, "Today's list could not be read. Please try again.")

const todayFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<TodayView> =>
    readToday((await actorFor(context.caller, data.projectId)).userId, data.projectId)
  )

/** One project's Strong fit posts and its replies waiting for an answer. */
export function loadToday(projectId: string) {
  return todayFn({ data: { projectId } })
}
