import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"

import {
  loadAdminOverview,
  type AdminOverview,
  type OverviewAutomation,
} from "@/server/admin-overview"
import type { FeedsAnnouncementRow, FeedsSummary } from "@/server/content/feeds"
import { adminGet } from "@/server/guards"
import type { MembershipSummary } from "@/server/people/membership"

// The feeds and membership types come out through here now that the Overview is
// the only page reading them. Browser code reaches a server type through a
// `lib/api` module and nowhere else, so they need a door on this side.
export type {
  AdminOverview,
  FeedsAnnouncementRow,
  FeedsSummary,
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
