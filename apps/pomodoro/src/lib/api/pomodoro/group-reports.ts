import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { GROUP_REPORT_REASON_IDS } from "@/lib/pomodoro/group-reports"
import { GROUP_JOIN_TOKEN_LENGTH } from "@/lib/pomodoro/groups"
import { HANDLE_MAX_LENGTH } from "@/lib/pomodoro/public-profile"
import { requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { reportGroup as reportGroupRow } from "@/server/pomodoro/group-reports"

/**
 * Reporting a group (groups task 01, part 24).
 *
 * Open on purpose and written down in `src/app/open-endpoints.ts`: a team
 * page is read by strangers with no account. The invite page's reader is
 * always signed in and is recorded; a team page's reader may not be. A rate
 * limit by address stands in for the account.
 */
const reportGroupFn = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        token: z.string().length(GROUP_JOIN_TOKEN_LENGTH).optional(),
        handle: z.string().trim().toLowerCase().min(1).max(HANDLE_MAX_LENGTH).optional(),
        reason: z.enum(GROUP_REPORT_REASON_IDS),
      })
      .refine((data) => Boolean(data.token) !== Boolean(data.handle))
  )
  .handler(async ({ data }) => {
    // No guard, so the origin check every guarded change makes is made here:
    // without it, any site could have a visitor's browser file reports.
    requireAppOrigin()
    const viewer = await findCurrentUser()
    await reportGroupRow({
      token: data.token,
      handle: data.handle,
      reason: data.reason,
      reporterUserId: viewer?.id ?? null,
    })
    // Always the same answer, whatever happened.
    return { filed: true as const }
  })

export const reportGroupByInvite = (
  token: string,
  reason: (typeof GROUP_REPORT_REASON_IDS)[number]
) => reportGroupFn({ data: { token, reason } })
export const reportTeamPage = (
  handle: string,
  reason: (typeof GROUP_REPORT_REASON_IDS)[number]
) => reportGroupFn({ data: { handle, reason } })
