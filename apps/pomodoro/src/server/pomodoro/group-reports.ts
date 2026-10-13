import { and, eq } from "drizzle-orm"

import {
  GROUP_REPORTS_PER_HOUR,
  type GroupReportReasonId,
} from "@/lib/pomodoro/group-reports"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { requestIp } from "@/server/auth/origin"
import { db } from "@/server/db"
import { noteNewReport, reportQueueAdminIds } from "@/server/pomodoro/notices"
import { pomodoroGroups, roomReports } from "@/server/pomodoro/schema"

/**
 * Reporting a group's name or line (groups task 01, part 24).
 *
 * A group is reported from the two places a stranger can see it: the invite
 * page, which names the group to anybody signed in holding the link, and its
 * public page at /team/<handle>, which anybody can read. The report joins
 * `room_reports`, the queue an operator already works, as kind `group`.
 *
 * Always answers the same way, whether or not the group exists, the same as
 * a profile report: a reader who guesses addresses learns nothing.
 */
export async function reportGroup({
  token,
  handle,
  reason,
  reporterUserId,
}: {
  /** The invite link's secret, from the invite page. */
  token?: string
  /** The team page's address, from /team/<handle>. */
  handle?: string
  reason: GroupReportReasonId
  reporterUserId: string | null
}) {
  await enforceRateLimit(`pomodoro-group-report:${requestIp()}`, {
    maxAttempts: GROUP_REPORTS_PER_HOUR,
    windowSeconds: 60 * 60,
  })

  const where = token
    ? eq(pomodoroGroups.joinToken, token)
    : handle
      ? and(eq(pomodoroGroups.handle, handle), eq(pomodoroGroups.pagePublic, true))
      : undefined
  if (!where) return
  const [group] = await db
    .select({ id: pomodoroGroups.id, ownerUserId: pomodoroGroups.ownerUserId })
    .from(pomodoroGroups)
    .where(where)
    .limit(1)
  if (!group) return
  // Reporting your own group changes nothing, and says so the same way.
  if (reporterUserId && reporterUserId === group.ownerUserId) return

  // Read before the transaction: a read on the shared handle from inside one
  // waits on a second connection.
  const adminIds = await reportQueueAdminIds()
  await db.transaction(async (tx) => {
    await tx.insert(roomReports).values({
      kind: "group",
      groupId: group.id,
      reporterUserId,
      reason,
    })
    await noteNewReport(tx, { adminIds, reporterUserId, thing: "group" })
  })
}
