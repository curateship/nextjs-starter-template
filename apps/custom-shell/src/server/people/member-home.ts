import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { billingEnabled } from "@/server/billing/stripe"
import { db, type CustomShellDb } from "@/server/db"
import { loadEntitlements } from "@/server/billing/entitlements"
import { getNotificationPage } from "@/server/notifications/inbox"
import { readShellGlobals } from "@/server/shell-settings"
import { findWorkspaceIdForRequest } from "@/server/workspaces/for-request"
import {
  customShellFeedback,
  customShellFeedbackComments,
  customShellFeedbackVotes,
  type CustomShellUser,
} from "@/server/schema"

import type { FeedbackType } from "@/lib/api/feedback"
import type { NotificationItem } from "@/lib/api/notification"
import type { FeedbackStatus } from "@/lib/feedback/feedback-status"

/** How many of each list the home page shows. */
const NOTIFICATIONS_SHOWN = 6
const FEEDBACK_SHOWN = 5

/** One of the reader's own feedback items, as the home card lists it. */
export type MemberHomeFeedback = {
  id: string
  type: FeedbackType
  status: FeedbackStatus
  message: string
  created_at: string
  vote_count: number
  comment_count: number
}

/**
 * Where the reader's plan stands — the fields `planSummary` reads, plus the
 * plan's name and whether there is anything to buy.
 */
export type MemberHomePlan = {
  planName: string
  isPaid: boolean
  status: string
  source: "stripe" | "manual" | null
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  /** True while their plan is on hold, which is why the rest reads as free. */
  paused: boolean
  /** The plan waiting behind that pause, so the card can name it. */
  pausedPlanName: string | null
  /** False turns the plan card's button off — there is nothing to change. */
  billingEnabled: boolean
}

export type MemberHome = {
  plan: MemberHomePlan
  notifications: NotificationItem[]
  unreadNotifications: number
  feedback: MemberHomeFeedback[]
  /** Everything they have ever filed, so the card can own up to what it hides. */
  feedbackTotal: number
}

/**
 * The member's own front door, in one request.
 *
 * Every figure here is read from the table the thing it links to reads — the
 * plan from their entitlements, the notices from the same query the bell uses,
 * the feedback counts from the votes and comments themselves — so a number on
 * this page and the window it opens can never disagree.
 */
export async function loadMemberHome(
  user: Pick<CustomShellUser, "id">,
  database: CustomShellDb = db
): Promise<MemberHome> {
  // Three reads that do not depend on each other, on a database that is a
  // second or two away, so they go out together rather than one after another.
  const notificationTypesPromise = readShellGlobals(database).then(
    (settings) => settings.notificationTypes
  )
  // Their own feedback, on the site they are on: somebody who uses two of the
  // deployment's sites has a separate list on each, the same way a visitor sees
  // a separate board on each.
  const workspaceId = await findWorkspaceIdForRequest(user.id, database)
  const [{ entitlements }, notifications, feedback] = await Promise.all([
    loadEntitlements(user.id, database),
    notificationTypesPromise.then((notificationTypes) =>
      getNotificationPage({
        currentUser: user,
        limit: NOTIFICATIONS_SHOWN,
        database,
        notificationTypes,
      })
    ),
    // No site at all means nothing has been filed on one, which is an empty
    // list rather than a broken page.
    workspaceId
      ? listOwnFeedback(workspaceId, user.id, database)
      : Promise.resolve({ total: 0, items: [] }),
  ])

  return {
    plan: {
      planName: entitlements.planName,
      isPaid: entitlements.isPaid,
      status: entitlements.status,
      source: entitlements.source,
      currentPeriodEnd: entitlements.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: entitlements.trialEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
      paused: entitlements.paused,
      pausedPlanName: entitlements.pausedPlanName,
      billingEnabled: billingEnabled(),
    },
    notifications: notifications.notifications,
    unreadNotifications: notifications.unread_count,
    feedback: feedback.items,
    feedbackTotal: feedback.total,
  }
}

/**
 * The reader's own feedback, newest first, with the votes and replies each one
 * has picked up.
 *
 * The total counts everything they have ever filed, not the handful returned:
 * Postgres works a window function out before the limit is applied, so the
 * card's "12 items" and its five rows come from the one query.
 *
 * The two counts are then grouped by the database over just those five ids —
 * the same way `serializeFeedbackRows` does it, and deliberately not as a
 * hand-written correlated subquery, which drizzle renders without its table
 * prefix on a single-table select and silently counts the wrong thing.
 */
async function listOwnFeedback(
  workspaceId: string,
  userId: string,
  database: CustomShellDb
) {
  const rows = await database
    .select({
      id: customShellFeedback.id,
      type: customShellFeedback.type,
      status: customShellFeedback.status,
      message: customShellFeedback.message,
      createdAt: customShellFeedback.createdAt,
      total: sql<number>`(count(*) over ())::int`,
    })
    .from(customShellFeedback)
    .where(
      and(
        eq(customShellFeedback.workspaceId, workspaceId),
        eq(customShellFeedback.userId, userId)
      )
    )
    .orderBy(desc(customShellFeedback.createdAt))
    .limit(FEEDBACK_SHOWN)

  const total = rows[0]?.total ?? 0
  if (!rows.length) return { total, items: [] }

  const ids = rows.map((row) => row.id)
  const [voteRows, commentRows] = await Promise.all([
    database
      .select({
        feedbackId: customShellFeedbackVotes.feedbackId,
        count: sql<number>`count(*)::int`,
      })
      .from(customShellFeedbackVotes)
      .where(inArray(customShellFeedbackVotes.feedbackId, ids))
      .groupBy(customShellFeedbackVotes.feedbackId),

    database
      .select({
        feedbackId: customShellFeedbackComments.feedbackId,
        count: sql<number>`count(*)::int`,
      })
      .from(customShellFeedbackComments)
      .where(inArray(customShellFeedbackComments.feedbackId, ids))
      .groupBy(customShellFeedbackComments.feedbackId),
  ])

  const votes = new Map(voteRows.map((row) => [row.feedbackId, row.count]))
  const comments = new Map(commentRows.map((row) => [row.feedbackId, row.count]))

  return {
    total,
    items: rows.map(
      (row): MemberHomeFeedback => ({
        id: row.id,
        type: row.type as FeedbackType,
        status: row.status as FeedbackStatus,
        message: row.message,
        created_at: row.createdAt.toISOString(),
        vote_count: votes.get(row.id) ?? 0,
        comment_count: comments.get(row.id) ?? 0,
      })
    ),
  }
}
