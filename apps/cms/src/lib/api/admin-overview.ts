import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { createErrorMessage } from "./error-message"

import {
  loadAdminOverview,
  type AdminOverview,
  type OverviewAutomation,
} from "@/server/admin-overview"
import type { FeedsAnnouncementRow, FeedsSummary } from "@/server/content/feeds"
import { adminGet, adminPost } from "@/server/guards"
import {
  MAX_DISMISSED_URGENT_SENT,
  MAX_URGENT_KEY_LENGTH,
} from "@/lib/dashboard/urgent-items"
import type { MembershipSummary } from "@/server/people/membership"
import { saveWorkspaceDismissedUrgent } from "@/server/people/workspaces"

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

export const getDismissUrgentErrorMessage = createErrorMessage(
  {},
  "We could not put that row away. Please try again."
)

/**
 * Remembers which urgent rows this admin has waved off their own dashboard.
 *
 * It saves the whole list, not the one row: dismissing and bringing one back
 * are the same write, so there is one door instead of two. Admin-only because
 * the card it belongs to is, and it writes the admin's own workspace and
 * nobody else's.
 *
 * The ceiling here only refuses a request that could not have come from the
 * card; what is actually kept is decided by `cleanDismissedUrgent` on the way
 * in. See `MAX_DISMISSED_URGENT_SENT` for why the two are not the same number.
 */
const saveDismissedUrgentFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      dismissedUrgent: z
        .array(z.string().min(1).max(MAX_URGENT_KEY_LENGTH))
        .max(MAX_DISMISSED_URGENT_SENT),
    })
  )
  .handler(async ({ data, context }) => {
    return {
      dismissedUrgent: await saveWorkspaceDismissedUrgent(
        context.user.id,
        data.dismissedUrgent
      ),
    }
  })

export function saveDismissedUrgent(dismissedUrgent: string[]) {
  return saveDismissedUrgentFn({ data: { dismissedUrgent } })
}
