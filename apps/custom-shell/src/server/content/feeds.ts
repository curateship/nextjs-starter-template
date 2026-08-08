import { desc, eq, notExists, sql } from "drizzle-orm"

import type { NotificationItem } from "@/lib/api/notification"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeNotificationRows } from "@/server/notifications/inbox"
import {
  customShellFeedback,
  customShellFeedbackComments,
  customShellNotifications,
  type CustomShellNotification,
} from "@/server/schema"

const LATEST_ACTIVITY = 40
const ACTIVITY_ROWS_SCANNED = 400
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type FeedsSummary = {
  notifications: { latest: NotificationItem[] }
  feedback: {
    last7Days: number
    previous7Days: number
    noReply: number
  }
}

/**
 * The activity list and feedback figures shown on the admin Overview.
 *
 * The figures are this site's. The activity list beside them is not scoped: it
 * reads the notification rows, and a notice already belongs to one person
 * rather than to a site. Narrowing it means answering who belongs to which
 * site, which nothing in the shell does yet.
 */
export async function loadFeedsSummary(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<FeedsSummary> {
  const today = now()
  const weekAgo = new Date(today.getTime() - WEEK_MS)
  const twoWeeksAgo = new Date(today.getTime() - 2 * WEEK_MS)
  const hasNoReply = notExists(
    database
      .select({ one: sql`1` })
      .from(customShellFeedbackComments)
      .where(
        eq(customShellFeedbackComments.feedbackId, customShellFeedback.id)
      )
  )

  const [notificationRows, feedbackCountRows] = await Promise.all([
    database
      .select({ notification: customShellNotifications })
      .from(customShellNotifications)
      .orderBy(
        desc(customShellNotifications.createdAt),
        desc(customShellNotifications.id)
      )
      .limit(ACTIVITY_ROWS_SCANNED),
    database
      .select({
        last7Days:
          sql`count(*) filter (where ${customShellFeedback.createdAt} >= ${weekAgo})`.mapWith(
            Number
          ),
        previous7Days:
          sql`count(*) filter (where ${customShellFeedback.createdAt} >= ${twoWeeksAgo} and ${customShellFeedback.createdAt} < ${weekAgo})`.mapWith(
            Number
          ),
        noReply: sql`count(*) filter (where ${hasNoReply})`.mapWith(Number),
      })
      .from(customShellFeedback)
      .where(eq(customShellFeedback.workspaceId, workspaceId)),
  ])

  const [feedback] = feedbackCountRows
  return {
    notifications: {
      latest: await serializeNotificationRows(
        groupActivityRows(notificationRows.map((row) => row.notification)),
        database
      ),
    },
    feedback: {
      last7Days: feedback?.last7Days ?? 0,
      previous7Days: feedback?.previous7Days ?? 0,
      noReply: feedback?.noReply ?? 0,
    },
  }
}

/** Collapse broadcasts sent to many people into one activity event. */
function groupActivityRows(rows: CustomShellNotification[]) {
  const readByAnyone = new Map<string, Date>()
  for (const row of rows) {
    const key = activityKey(row)
    const readAt = row.readAt
    if (readAt && !readByAnyone.has(key)) readByAnyone.set(key, readAt)
  }

  const seen = new Set<string>()
  const grouped: CustomShellNotification[] = []
  for (const row of rows) {
    const key = activityKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    grouped.push({ ...row, readAt: readByAnyone.get(key) ?? null })
    if (grouped.length === LATEST_ACTIVITY) break
  }

  return grouped
}

function activityKey(row: CustomShellNotification) {
  return row.changelogEntryId ?? row.announcementId ?? row.id
}
