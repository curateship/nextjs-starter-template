import { createServerFn } from "@tanstack/react-start"

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
  .handler(async (): Promise<AdminUsageSummary> => loadAdminUsageQuery())

export function loadAdminUsage() {
  return loadAdminUsageFn()
}
