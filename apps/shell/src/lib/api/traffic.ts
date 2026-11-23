import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

import {
  loadTrafficSummary as loadTrafficSummaryQuery,
  type TrafficDayPoint,
  type TrafficKeyCount,
  type TrafficSummary,
} from "@/server/traffic"
import { analyticsRangeSchema, type AnalyticsRange } from "@/lib/analytics/range"
import { adminGet } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export type { TrafficDayPoint, TrafficKeyCount, TrafficSummary }

export const getTrafficErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can see the traffic numbers." },
  "The traffic numbers could not be loaded. Please try again."
)

const loadTrafficSummaryFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      days: analyticsRangeSchema,
    })
  )
  .handler(async ({ data, context }): Promise<TrafficSummary> => {
    return loadTrafficSummaryQuery(
      await workspaceIdForRequest(context.user.id),
      data.days
    )
  })

export function loadTrafficSummary(days: AnalyticsRange) {
  return loadTrafficSummaryFn({ data: { days } })
}
