import { and, eq, inArray, isNull } from "drizzle-orm"

import { PROFILE_HIDDEN_MESSAGE } from "@/lib/pomodoro/notices"
import {
  PROFILE_REPORTS_PER_HOUR,
  type ProfileReportReasonId,
} from "@/lib/pomodoro/profile-reports"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { requestIp } from "@/server/auth/origin"
import { db } from "@/server/db"
import {
  noteNewReport,
  reportQueueAdminIds,
  writeNotices,
} from "@/server/pomodoro/notices"
import { forgetPublicProfile } from "@/server/pomodoro/public-profile"
import {
  pomodoroAuditLogs,
  pomodoroProfiles,
  roomReports,
} from "@/server/pomodoro/schema"

/**
 * Reporting a public profile, and an operator hiding one.
 *
 * The report goes into `room_reports`, the queue an operator already works,
 * rather than a second queue nobody would remember to open. That table's
 * `room_id` and `reporter_user_id` stopped being required for this: a profile
 * belongs to no room, and the reader filing the report usually has no
 * account, because the page is public and most of its readers are strangers.
 *
 * Hiding sets `hidden_at`, which the public read already tests, so a hidden
 * profile answers exactly the 404 a switched-off one does. The owner is told
 * on their own Settings card rather than left thinking the app broke.
 */

/**
 * Files a report against the profile at `handle`.
 *
 * Always answers the same way, whether or not the handle resolves. A reader
 * who guesses addresses learns nothing about which ones exist, and the queue
 * gets no rows for profiles that were never there.
 */
export async function reportProfile({
  handle,
  reason,
  reporterUserId,
}: {
  handle: string
  reason: ProfileReportReasonId
  reporterUserId: string | null
}) {
  // By address, because a public page has no account to count against. Signed
  // in or not, the same address gets the same budget.
  await enforceRateLimit(`pomodoro-profile-report:${requestIp()}`, {
    maxAttempts: PROFILE_REPORTS_PER_HOUR,
    windowSeconds: 60 * 60,
  })

  if (!isHandleAvailableShape(handle)) return
  const [profile] = await db
    .select({ userId: pomodoroProfiles.userId })
    .from(pomodoroProfiles)
    .where(
      and(
        eq(pomodoroProfiles.handle, handle),
        eq(pomodoroProfiles.profilePublic, true)
      )
    )
    .limit(1)
  // No such page, so nothing to report. The caller is told the same thing it
  // would be told about a real one.
  if (!profile) return

  // Reporting your own profile is a no-op rather than a refusal, so nothing
  // about the reader's identity is confirmed by the answer.
  if (reporterUserId && reporterUserId === profile.userId) return

  // Read before the transaction: a read on the shared handle from inside one
  // waits on a second connection.
  const adminIds = await reportQueueAdminIds()
  await db.transaction(async (tx) => {
    await tx.insert(roomReports).values({
      kind: "profile",
      profileUserId: profile.userId,
      reporterUserId,
      reason,
    })
    await noteNewReport(tx, { adminIds, reporterUserId, thing: "profile" })
  })
}

/**
 * Hides or restores a reported profile.
 *
 * Hide is the only power an operator has over a profile. Tyler's call,
 * 2 Oct 2026: clearing one field, warning somebody and suspending an account
 * are three different powers and each needs its own decision.
 *
 * Returns the ids that actually changed, so the caller can describe a bulk
 * press honestly, the same shape `reviewRoomReports` uses.
 */
export async function setProfilesHidden({
  reportIds,
  hidden,
  actorUserId,
}: {
  reportIds: string[]
  hidden: boolean
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const reports = await tx
      .select({
        id: roomReports.id,
        profileUserId: roomReports.profileUserId,
      })
      .from(roomReports)
      .where(
        and(inArray(roomReports.id, reportIds), eq(roomReports.kind, "profile"))
      )

    const userIds = [
      ...new Set(
        reports
          .map((report) => report.profileUserId)
          .filter((id): id is string => Boolean(id))
      ),
    ]
    if (!userIds.length) return { changed: [], skipped: reportIds }

    // Only a profile that was showing until now is newly hidden, so a second
    // hide, or a hide over several reports about one person, tells its owner
    // once.
    const newlyHidden = hidden
      ? (
          await tx
            .select({ userId: pomodoroProfiles.userId })
            .from(pomodoroProfiles)
            .where(
              and(
                inArray(pomodoroProfiles.userId, userIds),
                isNull(pomodoroProfiles.hiddenAt)
              )
            )
        ).map((row) => row.userId)
      : []

    const updated = await tx
      .update(pomodoroProfiles)
      .set({ hiddenAt: hidden ? new Date() : null, updatedAt: new Date() })
      .where(inArray(pomodoroProfiles.userId, userIds))
      .returning({ handle: pomodoroProfiles.handle })

    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: hidden ? "hide" : "unhide",
      resource: "pomodoro_profile",
      recordIds: reports.map((report) => report.id),
    })

    // The owner hears it in the bell as well as on their Settings card, which
    // they may never open. It names neither the operator nor the reporter.
    await writeNotices(
      tx,
      newlyHidden.map((userId) => ({
        recipientUserId: userId,
        kind: "profile_hidden" as const,
        message: PROFILE_HIDDEN_MESSAGE,
        href: "/settings?tab=public",
      }))
    )

    return {
      changed: reports.map((report) => report.id),
      skipped: reportIds.filter(
        (id) => !reports.some((report) => report.id === id)
      ),
      // Handed back so the caller can drop the held copies outside the
      // transaction; a hide must take effect on the very next request.
      handles: updated.map((row) => row.handle),
    }
  })
}

/** Drops the held pages for handles a hide or unhide just changed. */
export function forgetHiddenProfiles(handles: (string | null)[]) {
  for (const handle of handles) forgetPublicProfile(handle)
}
