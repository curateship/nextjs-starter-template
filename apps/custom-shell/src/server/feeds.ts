import { desc, eq, notExists, sql } from "drizzle-orm"

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
import {
  customShellFeedback,
  customShellFeedbackComments,
  customShellFeedbackVotes,
  customShellNotifications,
  customShellUsers,
  type CustomShellNotification,
} from "@/server/schema"
import { now } from "@/server/security"

/**
 * The numbers behind /admin/feeds. Nothing here is new data: every figure is
 * read from the same tables the Announcements, Notifications, Changelog and
 * Feedback pages read, so a tile and the page it links to can never disagree.
 */

/** How many recent rows each list card shows. */
const LATEST_ANNOUNCEMENTS = 4
const LATEST_CHANGELOG_ENTRIES = 4
const LATEST_ACTIVITY = 8
const TOP_FEEDBACK = 3

/**
 * Notice rows read before the activity feed groups them. Publishing one update
 * writes a notice per person, so a handful of events can be hundreds of rows —
 * the feed shows one line per event and this is how far back it looks for them.
 */
const ACTIVITY_ROWS_SCANNED = 150

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

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
  authorName: string
  votes: number
  createdAt: string
}

export type FeedsSummary = {
  /** The stretch of days every "this week" figure counts over. */
  week: { from: string; to: string }
  announcements: {
    showingNow: number
    scheduled: number
    total: number
    /** The next one due to start, when one is still ahead. */
    nextScheduled: FeedsAnnouncementRow | null
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
    /** When the longest-waiting unopened notice was sent. */
    oldestUnreadAt: string | null
    latest: NotificationItem[]
  }
  changelog: {
    total: number
    published: number
    drafts: number
    lastPublishedAt: string | null
    latest: FeedsChangelogRow[]
  }
  feedback: {
    total: number
    last7Days: number
    /** The seven days before those, so this week can be put in context. */
    previous7Days: number
    /** Feedback nobody has replied to yet. */
    noReply: number
    /** The pieces people have voted for most. */
    topVoted: FeedsFeedbackRow[]
  }
}

export async function loadFeedsSummary(
  database: CustomShellDb = db
): Promise<FeedsSummary> {
  const today = now()
  const weekAgo = new Date(today.getTime() - WEEK_MS)
  const twoWeeksAgo = new Date(today.getTime() - 2 * WEEK_MS)

  // Four reads at once, like the membership overview — one after another would
  // be the whole page's wait on a faraway database. The pool falls over past
  // five queries in flight; the naming below waits for these before it runs.
  const [announcementRows, changelogRows, notificationRows, feedbackCountRows] =
    await Promise.all([
      listAnnouncements(database),
      listChangelogEntries(database),
      // The newest rows and the whole table's counts in one pass: the window
      // aggregates are figured before the limit cuts the page down.
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
          // Comes back as a Date from Postgres and as text from the test
          // driver, so it is read as either below.
          oldestUnreadAt: sql<
            Date | string | null
          >`min(${customShellNotifications.createdAt}) filter (where ${customShellNotifications.readAt} is null) over ()`,
        })
        .from(customShellNotifications)
        .orderBy(
          desc(customShellNotifications.createdAt),
          desc(customShellNotifications.id)
        )
        .limit(ACTIVITY_ROWS_SCANNED),
      // Every feedback figure in one pass. "No reply" asks the comments table
      // per row, which is what the Feedback page's comment count does too.
      database
        .select({
          total: sql`count(*)`.mapWith(Number),
          last7Days: sql`count(*) filter (where ${customShellFeedback.createdAt} >= ${weekAgo})`.mapWith(
            Number
          ),
          previous7Days: sql`count(*) filter (where ${customShellFeedback.createdAt} >= ${twoWeeksAgo} and ${customShellFeedback.createdAt} < ${weekAgo})`.mapWith(
            Number
          ),
          noReply: sql`count(*) filter (where ${notExists(
            database
              .select({ one: sql`1` })
              .from(customShellFeedbackComments)
              .where(
                eq(
                  customShellFeedbackComments.feedbackId,
                  customShellFeedback.id
                )
              )
          )})`.mapWith(Number),
        })
        .from(customShellFeedback),
    ])

  // The second wave runs only after the reads above have answered: the notice
  // naming looks up people and titles (up to four queries at once) and the
  // most-voted feedback rides beside it — five in flight at the very worst.
  const [latestActivity, topFeedbackRows] = await Promise.all([
    serializeNotificationRows(
      groupActivityRows(notificationRows.map((row) => row.notification)),
      database
    ),
    database
      .select({
        id: customShellFeedback.id,
        type: customShellFeedback.type,
        message: customShellFeedback.message,
        createdAt: customShellFeedback.createdAt,
        authorName: customShellUsers.name,
        votes: sql`count(${customShellFeedbackVotes.id})`.mapWith(Number),
      })
      .from(customShellFeedback)
      .innerJoin(
        customShellUsers,
        eq(customShellUsers.id, customShellFeedback.userId)
      )
      .leftJoin(
        customShellFeedbackVotes,
        eq(customShellFeedbackVotes.feedbackId, customShellFeedback.id)
      )
      .groupBy(customShellFeedback.id, customShellUsers.name)
      .orderBy(
        desc(sql`count(${customShellFeedbackVotes.id})`),
        desc(customShellFeedback.createdAt)
      )
      .limit(TOP_FEEDBACK),
  ])

  const notificationCounts = notificationRows[0]
  const feedbackCounts = feedbackCountRows[0]

  const nowMs = today.getTime()
  let showingNow = 0
  let scheduled = 0
  let nextScheduled: FeedsAnnouncementRow | null = null
  const announcements: FeedsAnnouncementRow[] = []

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

    const serialized = serializeAnnouncement(announcement)
    const row: FeedsAnnouncementRow = {
      id: serialized.id,
      title: serialized.title,
      level: serialized.level,
      status,
      startsAt: serialized.startsAt,
      endsAt: serialized.endsAt,
    }
    announcements.push(row)

    // The one going live soonest, not the one furthest out.
    if (
      status === "scheduled" &&
      (!nextScheduled || row.startsAt < nextScheduled.startsAt)
    ) {
      nextScheduled = row
    }
  }

  const publishedEntries = changelogRows.filter((entry) => entry.publishedAt)
  const lastPublished = publishedEntries.reduce<Date | null>(
    (latest, entry) =>
      entry.publishedAt && (!latest || entry.publishedAt > latest)
        ? entry.publishedAt
        : latest,
    null
  )

  return {
    week: { from: weekAgo.toISOString(), to: today.toISOString() },
    announcements: {
      showingNow,
      scheduled,
      total: announcementRows.length,
      nextScheduled,
      // What is on screen first, then what is coming, then what is over — the
      // order the Announcements page itself sorts into.
      latest: announcements
        .sort(compareAnnouncements)
        .slice(0, LATEST_ANNOUNCEMENTS),
    },
    notifications: {
      total: notificationCounts?.total ?? 0,
      unread: notificationCounts?.unread ?? 0,
      sentLast7Days: notificationCounts?.sentLast7Days ?? 0,
      oldestUnreadAt: toIsoString(notificationCounts?.oldestUnreadAt),
      latest: latestActivity,
    },
    changelog: {
      total: changelogRows.length,
      published: publishedEntries.length,
      drafts: changelogRows.length - publishedEntries.length,
      lastPublishedAt: lastPublished?.toISOString() ?? null,
      // Drafts sort ahead of published entries here, same as the Changelog
      // page itself: what needs finishing sits on top.
      latest: changelogRows
        .slice(0, LATEST_CHANGELOG_ENTRIES)
        .map(serializeChangelogEntry),
    },
    feedback: {
      total: feedbackCounts?.total ?? 0,
      last7Days: feedbackCounts?.last7Days ?? 0,
      previous7Days: feedbackCounts?.previous7Days ?? 0,
      noReply: feedbackCounts?.noReply ?? 0,
      topVoted: topFeedbackRows.map((row) => ({
        id: row.id,
        // The check constraint on the column keeps the value in this set.
        type: row.type as FeedbackType,
        message: row.message,
        authorName: row.authorName,
        votes: row.votes,
        createdAt: row.createdAt.toISOString(),
      })),
    },
  }
}

/** A timestamp read straight off a query, whichever shape the driver gives. */
function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const announcementOrder: Record<FeedsAnnouncementStatus, number> = {
  showing: 0,
  scheduled: 1,
  ended: 2,
}

function compareAnnouncements(a: FeedsAnnouncementRow, b: FeedsAnnouncementRow) {
  const byStatus = announcementOrder[a.status] - announcementOrder[b.status]
  return byStatus !== 0 ? byStatus : b.startsAt.localeCompare(a.startsAt)
}

/**
 * One line per event, newest first.
 *
 * Publishing an update or an announcement writes an identical notice to every
 * person on the app, so the raw table would fill the whole feed with one event
 * repeated. Rows about the same update or announcement collapse into the first
 * of them; a comment or a thumbs up is already one row for one thing and is
 * left alone.
 *
 * A collapsed line stands for everyone who was sent it, so it only counts as
 * unopened while nobody at all has opened it — one person's read mark would be
 * a coin toss over which row happened to be kept.
 */
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

/** What makes two notices the same event: the thing they are about. */
function activityKey(row: CustomShellNotification) {
  return row.changelogEntryId ?? row.announcementId ?? row.id
}
