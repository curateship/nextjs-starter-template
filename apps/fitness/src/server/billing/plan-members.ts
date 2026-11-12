import { count, eq, isNotNull, and } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { activeSubscriptionCondition } from "@/server/billing/entitlements"
import { getDefaultPlan } from "@/server/billing/plans"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSubscriptions, customShellUsers } from "@/server/schema"

/**
 * How many accounts each plan has, by plan id, for the Admin Plans rows
 * (Tyler, 9 Nov 2026: "where the pricing was put the amount of users in that
 * plan"). The same rule as the Users list's Plan column (`toAccountRow` in
 * `src/server/people/accounts.ts`): an account paying for a plan is on it,
 * and everyone else, paused included, is on the default plan. So the counts
 * add up to the Users count. A plan nobody is on is missing; read it as 0.
 */
export async function planMemberCounts(database: CustomShellDb = db): Promise<Record<string, number>> {
  const [[accounts], paying, defaultPlan] = await Promise.all([
    database.select({ total: count() }).from(customShellUsers),
    database
      .select({ planId: customShellSubscriptions.planId, total: count() })
      .from(customShellSubscriptions)
      .innerJoin(customShellUsers, eq(customShellUsers.id, customShellSubscriptions.userId))
      .where(and(isNotNull(customShellSubscriptions.planId), activeSubscriptionCondition(now())))
      .groupBy(customShellSubscriptions.planId),
    getDefaultPlan(database),
  ])
  const counts: Record<string, number> = {}
  let paid = 0
  for (const row of paying) {
    if (!row.planId) continue
    counts[row.planId] = row.total
    paid += row.total
  }
  if (defaultPlan) counts[defaultPlan.id] = (counts[defaultPlan.id] ?? 0) + Math.max(0, (accounts?.total ?? 0) - paid)
  return counts
}
