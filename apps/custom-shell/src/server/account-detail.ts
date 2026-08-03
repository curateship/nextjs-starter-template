import { eq } from "drizzle-orm"

import { aiAllowanceCentsFromFeatures } from "@/lib/ai-models"
import { db, type CustomShellDb } from "@/server/db"
import { loadEntitlements } from "@/server/entitlements"
import { loadAccountStorage, type AccountStorage } from "@/server/media"
import {
  customShellAiAllowanceOverrides,
  customShellUsers,
} from "@/server/schema"

/**
 * Everything the account window shows, gathered from the tables the existing
 * dashboards read. Nothing here is stored per-account — every number is the
 * same query its own dashboard runs, so the two can never disagree.
 */

type AccountProfile = {
  id: string
  email: string
  name: string
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

  // Two waves rather than one, on purpose. Every query below is independent, so
  // the obvious thing is to fire them together — but too many connections for
  // one page view has exhausted the pool before. This caps it at two in flight.
  const [{ entitlements }, storage] = await Promise.all([
    loadEntitlements(userId, database),
    loadAccountStorage(userId, database),
  ])
  const [aiOverride] = await database
    .select({
      monthlyCents: customShellAiAllowanceOverrides.monthlyCents,
    })
    .from(customShellAiAllowanceOverrides)
    .where(eq(customShellAiAllowanceOverrides.userId, userId))
    .limit(1)

  return {
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
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
    },
    aiAllowance: {
      overrideCents: aiOverride?.monthlyCents ?? null,
      planCents: aiAllowanceCentsFromFeatures(entitlements.features),
    },
    storage,
  }
}
