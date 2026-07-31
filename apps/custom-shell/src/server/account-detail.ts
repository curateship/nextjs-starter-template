import { desc, eq, sql } from "drizzle-orm"

import { listAuditLogsForRecord, type AuditLogRow } from "@/server/audit"
import { db, type CustomShellDb } from "@/server/db"
import { loadEntitlements } from "@/server/entitlements"
import { loadAccountStorage, type AccountStorage } from "@/server/media"
import {
  customShellFeedback,
  customShellFeedbackComments,
  customShellFeedbackVotes,
  customShellUsers,
} from "@/server/schema"

/**
 * Everything one account's page shows, gathered from the tables the existing
 * dashboards read. Nothing here is stored per-account — every number is the
 * same query its own dashboard runs, so the two can never disagree.
 */

/** Enough rows to answer a support question without paging a detail page. */
const ACCOUNT_FEEDBACK_LIMIT = 20
const ACCOUNT_ACTIVITY_LIMIT = 20

type AccountProfile = {
  id: string
  email: string
  name: string
  role: string
  status: string
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

type AccountSubscription = {
  planName: string
  planSlug: string
  isPaid: boolean
  status: string
  interval: "monthly" | "yearly" | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  trialEndsAt: string | null
  source: "stripe" | "manual" | null
}

type AccountFeedbackItem = {
  id: string
  type: string
  message: string
  createdAt: string
  votes: number
  comments: number
}

export type AccountDetail = {
  profile: AccountProfile
  subscription: AccountSubscription
  storage: AccountStorage
  feedback: AccountFeedbackItem[]
  /** Capped lists; the flags say a dashboard holds more than is shown here. */
  feedbackTruncated: boolean
  activity: AuditLogRow[]
  activityTruncated: boolean
}

export async function loadAccountDetail(
  userId: string,
  database: CustomShellDb = db
): Promise<AccountDetail> {
  // Named columns, not the whole row: the users table carries the password
  // hash, and nothing that reads an account for display has any business
  // loading it.
  const [user] = await database
    .select({
      id: customShellUsers.id,
      email: customShellUsers.email,
      name: customShellUsers.name,
      role: customShellUsers.role,
      status: customShellUsers.status,
      emailVerifiedAt: customShellUsers.emailVerifiedAt,
      createdAt: customShellUsers.createdAt,
      updatedAt: customShellUsers.updatedAt,
    })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)

  if (!user) {
    throw new Error("USER_NOT_FOUND")
  }

  // Two waves rather than one, on purpose. Every query below is independent, so
  // the obvious thing is to fire them together — but that is five connections
  // for one page view, and the pool has already been exhausted by exactly that
  // on the activity log. This caps it at three in flight.
  const [{ entitlements }, storage] = await Promise.all([
    loadEntitlements(userId, database),
    loadAccountStorage(userId, database),
  ])
  const [feedback, activity] = await Promise.all([
    listAccountFeedback(userId, database),
    listAuditLogsForRecord(userId, ACCOUNT_ACTIVITY_LIMIT + 1, database),
  ])

  return {
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    subscription: {
      planName: entitlements.planName,
      planSlug: entitlements.planSlug,
      isPaid: entitlements.isPaid,
      status: entitlements.status,
      interval: entitlements.interval,
      currentPeriodEnd: entitlements.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
      trialEndsAt: entitlements.trialEndsAt?.toISOString() ?? null,
      source: entitlements.source,
    },
    storage,
    feedback: feedback.slice(0, ACCOUNT_FEEDBACK_LIMIT),
    feedbackTruncated: feedback.length > ACCOUNT_FEEDBACK_LIMIT,
    activity: activity.slice(0, ACCOUNT_ACTIVITY_LIMIT),
    activityTruncated: activity.length > ACCOUNT_ACTIVITY_LIMIT,
  }
}

/**
 * What this person posted, with the votes and replies it drew. One query: the
 * two joins fan the rows out, which is what `count(distinct ...)` undoes.
 *
 * Asks for one row past the cap so the page can say the list was cut short
 * instead of quietly showing a full-looking twenty.
 */
async function listAccountFeedback(
  userId: string,
  database: CustomShellDb
): Promise<AccountFeedbackItem[]> {
  const rows = await database
    .select({
      id: customShellFeedback.id,
      type: customShellFeedback.type,
      message: customShellFeedback.message,
      createdAt: customShellFeedback.createdAt,
      votes: sql<number>`count(distinct ${customShellFeedbackVotes.id})::int`,
      comments: sql<number>`count(distinct ${customShellFeedbackComments.id})::int`,
    })
    .from(customShellFeedback)
    .leftJoin(
      customShellFeedbackVotes,
      eq(customShellFeedbackVotes.feedbackId, customShellFeedback.id)
    )
    .leftJoin(
      customShellFeedbackComments,
      eq(customShellFeedbackComments.feedbackId, customShellFeedback.id)
    )
    .where(eq(customShellFeedback.userId, userId))
    .groupBy(customShellFeedback.id)
    .orderBy(desc(customShellFeedback.createdAt))
    .limit(ACCOUNT_FEEDBACK_LIMIT + 1)

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    votes: row.votes,
    comments: row.comments,
  }))
}
