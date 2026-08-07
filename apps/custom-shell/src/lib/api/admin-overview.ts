import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"

import {
  loadAdminOverview,
  type AdminOverview,
  type OverviewAutomation,
} from "@/server/admin-overview"
import { adminGet } from "@/server/guards"
import type { MembershipSummary } from "@/server/people/membership"

// Browser code reaches server types through this API module, never directly.
export type {
  AdminOverview,
  MembershipSummary,
  OverviewAutomation,
}

export const getAdminOverviewErrorMessage = createErrorMessage(
  {},
  "We could not load the overview. Please try again."
)

const loadAdminOverviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    return loadAdminOverview(context.user.id)
  })

export function loadAdminOverviewPage() {
  return loadAdminOverviewFn()
}
