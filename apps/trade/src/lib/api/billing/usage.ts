import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { analyticsRangeSchema, type AnalyticsRange } from "@/lib/analytics/range"
import { createErrorMessage } from "@/lib/api/error-message"
import {
  loadAdminUsage as loadAdminUsageQuery,
  type AdminUsageSummary,
} from "@/server/billing/usage"
import { adminGet } from "@/server/guards"

export type { AdminUsageSummary }

export const getUsageErrorMessage = createErrorMessage(
  {},
  "We could not load metered usage. Please try again."
)

const loadAdminUsageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ days: analyticsRangeSchema }))
  .handler(async ({ data }): Promise<AdminUsageSummary> => loadAdminUsageQuery(data.days))

export function loadAdminUsage(days: AnalyticsRange) {
  return loadAdminUsageFn({ data: { days } })
}
