import { and, eq } from "drizzle-orm"

import { enforceRateLimit } from "@/server/auth/rate-limit"
import { requestIp } from "@/server/auth/origin"
import { db } from "@/server/db"
import { noteNewReport, reportQueueAdminIds } from "@/server/pomodoro/notices"
import { pomodoroMediaUploads, pomodoroProfiles, roomReports } from "@/server/pomodoro/schema"
import { sharedWithOthers } from "@/server/pomodoro/shared-media"
import { PROFILE_REPORTS_PER_HOUR } from "@/lib/pomodoro/profile-reports"
import {
  COPYRIGHT_REPORTS_PER_HOUR,
  COPYRIGHT_STATEMENT,
  sharedFileFromAddress,
  type SharedFileReportReasonId,
} from "@/lib/pomodoro/shared-media-reports"

/**
 * Reports about shared files go into `room_reports`, the queue an admin
 * already works, the way profile reports do. See
 * `workspace/docs/reporting-and-blocking.md`.
 */

/**
 * Files a report against a shared file. Like a profile report it always
 * answers the same way: a file that is not shared, the reader's own file, or
 * a second report of the same file by the same member files nothing, and the
 * reader cannot tell.
 */
export async function reportSharedFile({
  mediaId,
  reason,
  reporterUserId,
}: {
  mediaId: string
  reason: SharedFileReportReasonId
  reporterUserId: string | null
}) {
  // By address, the profile report's budget, because the cards sit on public
  // pages most of whose readers have no account.
  await enforceRateLimit(`pomodoro-shared-report:${requestIp()}`, {
    maxAttempts: PROFILE_REPORTS_PER_HOUR,
    windowSeconds: 60 * 60,
  })
  const [file] = await db
    .select({ ownerUserId: pomodoroMediaUploads.userId })
    .from(pomodoroMediaUploads)
    .where(and(sharedWithOthers, eq(pomodoroMediaUploads.mediaId, mediaId)))
    .limit(1)
  if (!file || file.ownerUserId === reporterUserId) return

  const adminIds = await reportQueueAdminIds()
  await db.transaction(async (tx) => {
    const [filed] = await tx
      .insert(roomReports)
      .values({
        kind: "shared_file",
        mediaId,
        profileUserId: file.ownerUserId,
        reporterUserId,
        reason,
      })
      // One report per member per file (migration 0138); a signed-out reader
      // is held back by the address limit instead.
      .onConflictDoNothing()
      .returning({ id: roomReports.id })
    if (filed)
      await noteNewReport(tx, { adminIds, reporterUserId, thing: "shared_file" })
  })
}

/**
 * The public copyright form at `/copyright`, for a rights holder with no
 * account. The address they paste is matched to a shared file when it is
 * one; a claim about an address that is not still reaches the queue, because
 * the admin answers every claim by email.
 */
export async function reportCopyright({
  name,
  email,
  address,
  work,
}: {
  name: string
  email: string
  address: string
  work: string
}) {
  await enforceRateLimit(`pomodoro-copyright:${requestIp()}`, {
    maxAttempts: COPYRIGHT_REPORTS_PER_HOUR,
    windowSeconds: 60 * 60,
  })
  const pointed = sharedFileFromAddress(address)
  const [file] = pointed
    ? await db
        .select({ ownerUserId: pomodoroMediaUploads.userId })
        .from(pomodoroMediaUploads)
        .innerJoin(
          pomodoroProfiles,
          eq(pomodoroProfiles.userId, pomodoroMediaUploads.userId)
        )
        .where(
          and(
            eq(pomodoroMediaUploads.mediaId, pointed.mediaId),
            eq(pomodoroProfiles.handle, pointed.handle)
          )
        )
        .limit(1)
    : []

  const adminIds = await reportQueueAdminIds()
  await db.transaction(async (tx) => {
    await tx.insert(roomReports).values({
      kind: "copyright",
      mediaId: file ? pointed!.mediaId : null,
      profileUserId: file?.ownerUserId ?? null,
      reporterUserId: null,
      reason: COPYRIGHT_STATEMENT.slice(0, 300),
      contactName: name,
      contactEmail: email,
      details: `${address}\n\n${work}`.slice(0, 2000),
    })
    await noteNewReport(tx, { adminIds, reporterUserId: null, thing: "copyright" })
  })
}
