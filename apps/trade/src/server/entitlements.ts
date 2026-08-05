import { and, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm"

import type { PlanFeatures } from "@/lib/plan-features"
import { db, type CustomShellDb } from "@/server/db"
import { getDefaultPlan, getPlan } from "@/server/plans"
import {
  customShellSubscriptions,
  type CustomShellPlan,
  type CustomShellSubscription,
} from "@/server/schema"
import { requireUser } from "@/server/security"

/** Stripe statuses that still buy access while the paid period is running. */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"])

export type Entitlements = {
  planId: string | null
  planSlug: string
  planName: string
  isPaid: boolean
  status: string
  interval: "monthly" | "yearly" | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  trialEndsAt: Date | null
  source: "stripe" | "manual" | null
  features: PlanFeatures
}

const NO_PLAN: Entitlements = {
  planId: null,
  planSlug: "free",
  planName: "Free",
  isPaid: false,
  status: "none",
  interval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  source: null,
  features: {},
}

/**
 * A subscription only counts while its status is live *and* the paid period has
 * not lapsed, so a webhook we never received cannot leave someone on Pro
 * forever. Manual (admin-granted) plans use the same rule, with no end date
 * meaning no expiry.
 */
export function subscriptionIsActive(
  subscription: Pick<
    CustomShellSubscription,
    "status" | "currentPeriodEnd"
  > | null,
  timestamp = new Date()
) {
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) {
    return false
  }

  return (
    !subscription.currentPeriodEnd || subscription.currentPeriodEnd > timestamp
  )
}

/**
 * The same rule as `subscriptionIsActive`, written as a database condition for
 * the queries that have to ask it of thousands of rows at once instead of one.
 *
 * It lives beside the function it mirrors on purpose: two copies of "what
 * counts as paying" in two files is how a report and a mailing list end up
 * disagreeing about who is a customer.
 */
export function activeSubscriptionCondition(timestamp: Date): SQL {
  const live = inArray(customShellSubscriptions.status, [...ACTIVE_STATUSES])
  const notLapsed = or(
    isNull(customShellSubscriptions.currentPeriodEnd),
    gt(customShellSubscriptions.currentPeriodEnd, timestamp)
  )
  return and(live, notLapsed) as SQL
}

export function resolveEntitlements(
  subscription: CustomShellSubscription | null,
  paidPlan: CustomShellPlan | null,
  defaultPlan: CustomShellPlan | null,
  timestamp = new Date()
): Entitlements {
  const isPaid =
    Boolean(paidPlan) && subscriptionIsActive(subscription, timestamp)

  if (isPaid && paidPlan && subscription) {
    return {
      planId: paidPlan.id,
      planSlug: paidPlan.slug,
      planName: paidPlan.name,
      isPaid: true,
      status: subscription.status,
      interval: subscription.interval === "yearly" ? "yearly" : "monthly",
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      source: subscription.source === "manual" ? "manual" : "stripe",
      features: paidPlan.features ?? {},
    }
  }

  if (!defaultPlan) {
    return NO_PLAN
  }

  return {
    ...NO_PLAN,
    planId: defaultPlan.id,
    planSlug: defaultPlan.slug,
    planName: defaultPlan.name,
    features: defaultPlan.features ?? {},
  }
}

export async function findSubscription(
  userId: string,
  database: CustomShellDb = db
) {
  const [subscription] = await database
    .select()
    .from(customShellSubscriptions)
    .where(eq(customShellSubscriptions.userId, userId))
    .limit(1)

  return subscription ?? null
}

export async function loadEntitlements(
  userId: string,
  database: CustomShellDb = db
) {
  const subscription = await findSubscription(userId, database)
  const [paidPlan, defaultPlan] = await Promise.all([
    subscription?.planId ? getPlan(subscription.planId, database) : null,
    getDefaultPlan(database),
  ])

  return {
    subscription,
    entitlements: resolveEntitlements(subscription, paidPlan, defaultPlan),
  }
}

export function hasFeature(entitlements: Entitlements, key: string) {
  const value = entitlements.features[key]
  return value !== undefined && value !== false && value !== null
}

/**
 * The one way product code gates a paid feature:
 *
 *   const entitlements = await requireFeature("customDomains")
 */
export async function requireFeature(key: string, database: CustomShellDb = db) {
  const user = await requireUser(database)
  const { entitlements } = await loadEntitlements(user.id, database)

  if (!hasFeature(entitlements, key)) {
    throw new Error("UPGRADE_REQUIRED")
  }

  return entitlements
}
