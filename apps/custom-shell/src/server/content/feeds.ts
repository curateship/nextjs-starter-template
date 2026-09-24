import { and, desc, eq, gte, notExists, sql } from "drizzle-orm"

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
/** How many days the line on the feedback figure covers. */
const LINE_DAYS = 30

export type FeedsSummary = {
  notifications: { latest: NotificationItem[] }
  feedback: {
    last7Days: number
    previous7Days: number
    noReply: number
    /** Feedback left on each of the last 30 UTC days, oldest first. */
    last30Days: number[]
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
  const lineStart = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - (LINE_DAYS - 1)
    )
  )
  // `at time zone 'UTC'` so the days land in the same buckets as the dates
  // built from UTC below, whatever the database session's own timezone is.
  const feedbackDay = sql<string>`to_char(${customShellFeedback.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`
  const hasNoReply = notExists(
    database
      .select({ one: sql`1` })
      .from(customShellFeedbackComments)
      .where(
        eq(customShellFeedbackComments.feedbackId, customShellFeedback.id)
      )
  )

  // Three reads at once. The pool stands five, and the busy stage is the
  // notification wording after these, which runs on its own.
  const [notificationRows, feedbackCountRows, feedbackDayRows] =
    await Promise.all([
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
    database
      .select({
        day: feedbackDay,
        count: sql`count(*)`.mapWith(Number),
      })
      .from(customShellFeedback)
      .where(
        and(
          eq(customShellFeedback.workspaceId, workspaceId),
          gte(customShellFeedback.createdAt, lineStart)
        )
      )
      .groupBy(feedbackDay),
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
      last30Days: countsByDay(feedbackDayRows, lineStart, LINE_DAYS),
    },
  }
}

/** One count per day from `start`, with the days nobody left any as zero. */
function countsByDay(
  rows: { day: string; count: number }[],
  start: Date,
  days: number
) {
  const byDay = new Map(rows.map((row) => [row.day, row.count]))
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000)
    return byDay.get(date.toISOString().slice(0, 10)) ?? 0
  })
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
