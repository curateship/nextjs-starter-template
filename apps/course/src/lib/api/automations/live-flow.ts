import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { liveFlowReport, peopleInLiveFlows, type LiveFlowReport } from "@/server/automations/live-flow"
import { adminGet } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type {
  LiveFlowActivity,
  LiveFlowActivityKind,
  LiveFlowEmailRow,
  LiveFlowReport,
  LiveFlowStats,
  LiveFlowStep,
} from "@/server/automations/live-flow"

export const getLiveFlowErrorMessage = createErrorMessage(
  { NOT_FOUND: "This flow no longer exists." },
  "We could not read what this flow is doing. It tries again in a few seconds."
)

/**
 * A live flow's right panel, every card at once. `since` is where the
 * period starts (Today or 7 days, worked out in the browser so "today" is
 * the admin's own day); left out, everything counts.
 */
const liveFlowReportFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      automationId: z.string().min(1).max(36),
      since: z.string().datetime({ offset: true }).nullable().default(null),
    })
  )
  .handler(async ({ data, context }): Promise<LiveFlowReport> => {
    const report = await liveFlowReport(await workspaceIdForRequest(context.user.id), data.automationId, {
      since: data.since ? new Date(data.since) : null,
    })
    if (!report) throw new Error("NOT_FOUND")
    return report
  })

/** How many people are in each of the site's live flows, by flow id. */
const peopleInLiveFlowsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<Record<string, number>> =>
    peopleInLiveFlows(await workspaceIdForRequest(context.user.id))
  )

export function loadLiveFlowReport(automationId: string, since: string | null) {
  return liveFlowReportFn({ data: { automationId, since } })
}

export function loadPeopleInLiveFlows() {
  return peopleInLiveFlowsFn()
}
