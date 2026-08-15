import { eq, sql } from "drizzle-orm"

import { aiAllowanceCentsFromFeatures } from "@/lib/ai/ai-models"
import type { SubscriptionEvent } from "@/lib/billing/subscription-events"
import { db, type CustomShellDb } from "@/server/db"
import { loadEntitlements } from "@/server/billing/entitlements"
import { loadAccountStorage, type AccountStorage } from "@/server/media/library"
import {
  customShellAiAllowanceOverrides,
  customShellAuthSecurityReports,
  customShellUsers,
} from "@/server/schema"
import { listSubscriptionEvents } from "@/server/billing/subscription-events"
import { listMemberTags } from "@/server/people/member-tags"

/**
 * Everything the account window shows, gathered from the tables the existing
 * dashboards read. Nothing here is stored per-account — every number is the
 * same query its own dashboard runs, so the two can never disagree.
 */

type AccountProfile = {
  id: string
  email: string
  name: string
  tags: string[]
  role: string
  status: string
  /** When this account was marked for deletion, and null when it was not. */
  deletedAt: string | null
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
  /** True while billing is on hold. Everything above then reads as free. */
  paused: boolean
  /** The plan waiting behind the pause, so the window can name it. */
  pausedPlanName: string | null
}

/** This person's monthly AI ceiling: their own number, their plan's, or none. */
type AccountAiAllowance = {
  /** Set just for them, in cents. Null when they follow their plan. */
  overrideCents: number | null
  /** What their plan gives, in cents. Null when the plan sets no ceiling. */
  planCents: number | null
}

export type AccountDetail = {
  profile: AccountProfile
  subscription: AccountSubscription
  aiAllowance: AccountAiAllowance
  storage: AccountStorage
  /** What has happened to their plan since the app started recording it. */
  billingHistory: SubscriptionEvent[]
  securityReports: {
    count: number
    latestAt: string | null
  }
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
      deletedAt: customShellUsers.deletedAt,
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

  // These bounded waves are deliberate. Every query below is independent, but
  // too many connections for one page view has exhausted the pool before. This
  // keeps no more than two queries in flight at once.
  const [{ entitlements }, storage] = await Promise.all([
    loadEntitlements(userId, database),
    loadAccountStorage(userId, database),
  ])
  const [[aiOverride], billingHistory] = await Promise.all([
    database
      .select({
        monthlyCents: customShellAiAllowanceOverrides.monthlyCents,
      })
      .from(customShellAiAllowanceOverrides)
      .where(eq(customShellAiAllowanceOverrides.userId, userId))
      .limit(1),
    listSubscriptionEvents(userId, database),
  ])
  const [tagsByUser, [securityReports]] = await Promise.all([
    listMemberTags([userId], database),
    database
      .select({
        count: sql<number>`count(*)::int`,
        latestAt: sql<Date | null>`max(${customShellAuthSecurityReports.createdAt})`.mapWith(
          customShellAuthSecurityReports.createdAt
        ),
      })
      .from(customShellAuthSecurityReports)
      .where(eq(customShellAuthSecurityReports.userId, userId)),
  ])
  const tags = tagsByUser.get(userId) ?? []

  return {
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      tags,
      role: user.role,
      status: user.status,
      deletedAt: user.deletedAt?.toISOString() ?? null,
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
      paused: entitlements.paused,
      pausedPlanName: entitlements.pausedPlanName,
    },
    aiAllowance: {
      overrideCents: aiOverride?.monthlyCents ?? null,
      planCents: aiAllowanceCentsFromFeatures(entitlements.features),
    },
    storage,
    billingHistory,
    securityReports: {
      count: securityReports?.count ?? 0,
      latestAt: securityReports?.latestAt?.toISOString() ?? null,
    },
  }
}
