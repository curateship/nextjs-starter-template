import { createServerFn } from "@tanstack/react-start"

import {
  loadAdminOverview,
  type AdminOverview,
  type OverviewAutomation,
} from "@/server/admin-overview"
import type { FeedsAnnouncementRow, FeedsSummary } from "@/server/feeds"
import { requireAdmin } from "@/server/security"

// The feeds types come out through here now that the Overview is the only page
// reading them. Browser code reaches a server type through a `lib/api` module
// and nowhere else, so they need a door on this side.
export type {
  AdminOverview,
  FeedsAnnouncementRow,
  FeedsSummary,
  OverviewAutomation,
}

const overviewErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getAdminOverviewErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(overviewErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? overviewErrorMessages[matched]
    : "We could not load the overview. Please try again."
}

const loadAdminOverviewFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireAdmin()
    return loadAdminOverview(user.id)
  }
)

export function loadAdminOverviewPage() {
  return loadAdminOverviewFn()
}
