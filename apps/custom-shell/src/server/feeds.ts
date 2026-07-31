import { desc, sql } from "drizzle-orm"

import type { AnnouncementLevel } from "@/lib/announcement"
import type { FeedbackType } from "@/lib/api/feedback"
import type { NotificationItem } from "@/lib/api/notification"
import { listAnnouncements, serializeAnnouncement } from "@/server/announcements"
import {
  listChangelogEntries,
  serializeChangelogEntry,
} from "@/server/changelog"
import { db, type CustomShellDb } from "@/server/db"
import { serializeNotificationRows } from "@/server/notifications"
import { customShellFeedback, customShellNotifications } from "@/server/schema"
import { now } from "@/server/security"

/**
 * The numbers behind /admin/feeds. Nothing here is new data: every figure is
 * read from the same tables the Announcements, Notifications, Changelog and
 * Activity log pages read, so a tile and the page it links to can never
 * disagree.
 */

/** How many recent rows each list card shows. */
const LATEST_ANNOUNCEMENTS = 5
const LATEST_CHANGELOG_ENTRIES = 5
const LATEST_NOTIFICATIONS = 8
const LATEST_FEEDBACK = 5

/** Where an announcement's window puts it, in the words its own page uses. */
export type FeedsAnnouncementStatus = "showing" | "scheduled" | "ended"

export type FeedsAnnouncementRow = {
  id: string
  title: string
  level: AnnouncementLevel
  status: FeedsAnnouncementStatus
  startsAt: string
  endsAt: string | null
}

export type FeedsChangelogRow = ReturnType<typeof serializeChangelogEntry>

export type FeedsFeedbackRow = {
  id: string
  type: FeedbackType
  message: string
  createdAt: string
}

export type FeedsSummary = {
  announcements: {
    showingNow: number
    scheduled: number
    total: number
    latest: FeedsAnnouncementRow[]
  }
  /**
   * A notice is one row per person per thing, written by the app — so the
   * counts come from the whole table but only a handful of rows are listed.
   */
  notifications: {
    total: number
    unread: number
    sentLast7Days: number
    latest: NotificationItem[]
  }
  changelog: {
    total: number
    published: number
    drafts: number
    latest: FeedsChangelogRow[]
  }
  feedback: {
    total: number
    last7Days: number
    latest: FeedsFeedbackRow[]
  }
}

export async function loadFeedsSummary(
  database: CustomShellDb = db
): Promise<FeedsSummary> {
  const today = now()
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Three reads at once, like the membership overview — one after another
  // would be the whole page's wait on a faraway database. The pool falls over
  // past five queries in flight; the notification naming below waits for
  // these before it runs.
  const [announcementRows, changelogRows, notificationRows] =
    await Promise.all([
      listAnnouncements(database),
      listChangelogEntries(database),
      // The newest few rows and the whole table's counts in one pass: the
      // window aggregates are figured before the limit cuts the page down.
      database
        .select({
          notification: customShellNotifications,
          total: sql`count(*) over ()`.mapWith(Number),
          unread: sql`count(*) filter (where ${customShellNotifications.readAt} is null) over ()`.mapWith(
            Number
          ),
          sentLast7Days: sql`count(*) filter (where ${customShellNotifications.createdAt} >= ${weekAgo}) over ()`.mapWith(
            Number
          ),
        })
        .from(customShellNotifications)
        .orderBy(
          desc(customShellNotifications.createdAt),
          desc(customShellNotifications.id)
        )
        .limit(LATEST_NOTIFICATIONS),
    ])

  // The second wave runs only after the reads above have all answered: the
  // notice naming looks up people and titles (up to four queries at once) and
  // the feedback read rides beside it — five in flight at the very worst.
  const [latestNotifications, feedbackRows] = await Promise.all([
    serializeNotificationRows(
      notificationRows.map((row) => row.notification),
      database
    ),
    database
      .select({
        id: customShellFeedback.id,
        type: customShellFeedback.type,
        message: customShellFeedback.message,
        createdAt: customShellFeedback.createdAt,
        total: sql`count(*) over ()`.mapWith(Number),
        last7Days: sql`count(*) filter (where ${customShellFeedback.createdAt} >= ${weekAgo}) over ()`.mapWith(
          Number
        ),
      })
      .from(customShellFeedback)
      .orderBy(desc(customShellFeedback.createdAt), desc(customShellFeedback.id))
      .limit(LATEST_FEEDBACK),
  ])
  const notificationCounts = notificationRows[0]
  const feedbackCounts = feedbackRows[0]

  const nowMs = today.getTime()
  let showingNow = 0
  let scheduled = 0
  const latestAnnouncements: FeedsAnnouncementRow[] = []

  for (const announcement of announcementRows) {
    const endsMs = announcement.endsAt?.getTime() ?? null
    const status: FeedsAnnouncementStatus =
      endsMs !== null && endsMs <= nowMs
        ? "ended"
        : announcement.startsAt.getTime() > nowMs
          ? "scheduled"
          : "showing"

    if (status === "showing") showingNow += 1
    if (status === "scheduled") scheduled += 1

    if (latestAnnouncements.length < LATEST_ANNOUNCEMENTS) {
      const serialized = serializeAnnouncement(announcement)
      latestAnnouncements.push({
        id: serialized.id,
        title: serialized.title,
        level: serialized.level,
        status,
        startsAt: serialized.startsAt,
        endsAt: serialized.endsAt,
      })
    }
  }

  const published = changelogRows.filter((entry) => entry.publishedAt).length

  return {
    announcements: {
      showingNow,
      scheduled,
      total: announcementRows.length,
      latest: latestAnnouncements,
    },
    notifications: {
      total: notificationCounts?.total ?? 0,
      unread: notificationCounts?.unread ?? 0,
      sentLast7Days: notificationCounts?.sentLast7Days ?? 0,
      latest: latestNotifications,
    },
    changelog: {
      total: changelogRows.length,
      published,
      drafts: changelogRows.length - published,
      // Drafts sort ahead of published entries here, same as the Changelog
      // page itself: what needs finishing sits on top.
      latest: changelogRows
        .slice(0, LATEST_CHANGELOG_ENTRIES)
        .map(serializeChangelogEntry),
    },
    feedback: {
      total: feedbackCounts?.total ?? 0,
      last7Days: feedbackCounts?.last7Days ?? 0,
      latest: feedbackRows.map((row) => ({
        id: row.id,
        // The check constraint on the column keeps the value in this set.
        type: row.type as FeedbackType,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
      })),
    },
  }
}
