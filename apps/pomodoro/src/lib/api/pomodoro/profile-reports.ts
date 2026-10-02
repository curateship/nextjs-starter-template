import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROFILE_REPORT_REASON_IDS } from "@/lib/pomodoro/profile-reports"
import { HANDLE_MAX_LENGTH } from "@/lib/pomodoro/public-profile"
import { requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { reportProfile as reportProfileRow } from "@/server/pomodoro/profile-reports"

/**
 * Reporting a public profile.
 *
 * Open on purpose and written down in `src/app/open-endpoints.ts`: the page
 * is public, most of its readers have no account, and a report that required
 * one would mostly never be filed. A rate limit by address stands in for the
 * account, and it is a limit rather than a guard.
 */

const reportFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      handle: z.string().trim().toLowerCase().min(1).max(HANDLE_MAX_LENGTH),
      reason: z.enum(PROFILE_REPORT_REASON_IDS),
    })
  )
  .handler(async ({ data }) => {
    // Every other change in this app checks the request's origin, through the
    // `userPost` guard. This endpoint has no guard because it must answer a
    // reader with no account, so it makes the same check itself: without it,
    // any site could have a visitor's browser file reports.
    requireAppOrigin()
    // A signed-in reader is recorded on the report; a signed-out one is not,
    // and both are accepted.
    const viewer = await findCurrentUser()
    await reportProfileRow({
      handle: data.handle,
      reason: data.reason,
      reporterUserId: viewer?.id ?? null,
    })
    // Always the same answer. A reader cannot learn from this whether the
    // handle exists, whether they had already reported it, or whether they
    // are blocked.
    return { filed: true }
  })

export const reportProfile = (
  handle: string,
  reason: (typeof PROFILE_REPORT_REASON_IDS)[number]
) => reportFn({ data: { handle, reason } })
