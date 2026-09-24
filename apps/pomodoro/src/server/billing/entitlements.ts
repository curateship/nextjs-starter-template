import { and, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm"

import type { PlanFeatures } from "@/lib/billing/plan-features"
import { db, type CustomShellDb } from "@/server/db"
import { getDefaultPlan, getPlan } from "@/server/billing/plans"
import {
  customShellSubscriptions,
  type CustomShellPlan,
  type CustomShellSubscription,
} from "@/server/schema"
import { requireUser } from "@/server/auth/security"

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
  /** True while the plan is on hold: nothing is billed and nothing is unlocked. */
  paused: boolean
  /** The plan waiting behind a pause, so a screen can name what comes back. */
  pausedPlanName: string | null
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
  paused: false,
  pausedPlanName: null,
  features: {},
}

/** The two things every rule below asks about a stored subscription. */
type SubscriptionStanding = Pick<
  CustomShellSubscription,
  "status" | "currentPeriodEnd" | "pausedAt"
>

/**
 * A subscription Stripe still has on its books: its status is live *and* the
 * paid period has not lapsed, so a webhook we never received cannot leave
 * someone on Pro forever. Manual (admin-granted) plans use the same rule, with
 * no end date meaning no expiry.
 *
 * A paused plan is still one of these — it is on hold, not over — which is what
 * lets it be cancelled, resumed, or cleaned up when the account is deleted.
 */
export function subscriptionIsLive(
  subscription: Pick<SubscriptionStanding, "status" | "currentPeriodEnd"> | null,
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
 * A subscription that actually buys something right now: live, and not paused.
 *
 * This is the question every gate asks — entitlements, the plan badge, the
 * revenue figures, who counts as a member. Pausing is the one way to be a
 * subscriber and be entitled to nothing, and this is the single line that
 * makes that true everywhere at once.
 */
export function subscriptionIsActive(
  subscription: SubscriptionStanding | null,
  timestamp = new Date()
) {
  return (
    subscriptionIsLive(subscription, timestamp) && !subscription?.pausedAt
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
  return and(
    live,
    notLapsed,
    isNull(customShellSubscriptions.pausedAt)
  ) as SQL
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
      paused: false,
      pausedPlanName: null,
      features: paidPlan.features ?? {},
    }
  }

  // Everything from here down is the free plan, because a plan on hold unlocks
  // exactly as much as no plan at all.
  const free: Entitlements = defaultPlan
    ? {
        ...NO_PLAN,
        planId: defaultPlan.id,
        planSlug: defaultPlan.slug,
        planName: defaultPlan.name,
        features: defaultPlan.features ?? {},
      }
    : NO_PLAN

  // A plan on hold is still not the same as no plan: Stripe has it, it comes
  // back the moment somebody presses resume, and a screen that cannot say so
  // can only tell people they are on the free plan for no reason they can see.
  // So the free identity above stands, and the subscription's own facts ride
  // beside it. A pause that outlived its own period is over rather than on
  // hold, which is why the live rule is asked as well as the column.
  if (subscription?.pausedAt && subscriptionIsLive(subscription, timestamp)) {
    return {
      ...free,
      status: subscription.status,
      interval: subscription.interval === "yearly" ? "yearly" : "monthly",
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      source: subscription.source === "manual" ? "manual" : "stripe",
      paused: true,
      pausedPlanName: paidPlan?.name ?? null,
    }
  }

  return free
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
