import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  segmentDripProgress,
  type SegmentDripProgress,
} from "@/server/automations/segment-drip"
import { adminGet } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type { SegmentDripProgress } from "@/server/automations/segment-drip"

export const getSegmentDripProgressErrorMessage = createErrorMessage(
  { NOT_FOUND: "This flow no longer exists." },
  "We could not work out how far through the segment this flow is. Please try again."
)

/** How many people the dripped start has let in, and when the next batch goes. */
const loadSegmentDripProgressFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ automationId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<SegmentDripProgress> => {
    const progress = await segmentDripProgress(
      await workspaceIdForRequest(context.user.id),
      data.automationId
    )
    if (!progress) throw new Error("NOT_FOUND")
    return progress
  })

export function loadSegmentDripProgress(automationId: string) {
  return loadSegmentDripProgressFn({ data: { automationId } })
}
