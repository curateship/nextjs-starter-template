import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { subscriptionIsActive } from "@/server/entitlements"
import { getDefaultPlan, getPlan } from "@/server/plans"
import {
  customShellAdminAuditLogs,
  customShellPlans,
  customShellSessions,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

export type AccountSort = "name" | "email" | "role" | "plan" | "created"

export type AccountListQuery = {
  search: string
  role: "all" | "admin" | "member"
  status: "all" | "active" | "suspended"
  page: number
  pageSize: number
  sort: AccountSort
  direction: "asc" | "desc"
}

export type AccountRow = {
  id: string
  email: string
  name: string
  role: string
  status: string
  emailVerified: boolean
  planName: string
  planSlug: string
  planIsPaid: boolean
  subscriptionStatus: string | null
  subscriptionSource: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string
}

export async function listAccounts(
  query: AccountListQuery,
  database: CustomShellDb = db
) {
  const filters: SQL[] = []
  const search = query.search.trim()

  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(customShellUsers.email, pattern),
      ilike(customShellUsers.name, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.role !== "all") {
    filters.push(eq(customShellUsers.role, query.role))
  }
  if (query.status !== "all") {
    filters.push(eq(customShellUsers.status, query.status))
  }

  const where = filters.length ? and(...filters) : undefined
  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    name: customShellUsers.name,
    email: customShellUsers.email,
    role: customShellUsers.role,
    plan: customShellPlans.name,
    created: customShellUsers.createdAt,
  }[query.sort]

  const rows = await database
    .select({
      user: customShellUsers,
      subscription: customShellSubscriptions,
      plan: customShellPlans,
    })
    .from(customShellUsers)
    .leftJoin(
      customShellSubscriptions,
      eq(customShellSubscriptions.userId, customShellUsers.id)
    )
    .leftJoin(
      customShellPlans,
      eq(customShellPlans.id, customShellSubscriptions.planId)
    )
    .where(where)
    .orderBy(direction(sortColumn))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  const [totals] = await database
    .select({ total: count() })
    .from(customShellUsers)
    .where(where)

  const defaultPlan = await getDefaultPlan(database)
  const timestamp = now()

  const accounts: AccountRow[] = rows.map((row) => {
    const paid =
      Boolean(row.plan) && subscriptionIsActive(row.subscription, timestamp)

    return {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      status: row.user.status,
      emailVerified: Boolean(row.user.emailVerifiedAt),
      planName: paid && row.plan ? row.plan.name : (defaultPlan?.name ?? "Free"),
      planSlug: paid && row.plan ? row.plan.slug : (defaultPlan?.slug ?? "free"),
      planIsPaid: paid,
      subscriptionStatus: paid ? (row.subscription?.status ?? null) : null,
      subscriptionSource: paid ? (row.subscription?.source ?? null) : null,
      currentPeriodEnd:
        paid && row.subscription?.currentPeriodEnd
          ? row.subscription.currentPeriodEnd.toISOString()
          : null,
      cancelAtPeriodEnd: paid
        ? Boolean(row.subscription?.cancelAtPeriodEnd)
        : false,
      createdAt: row.user.createdAt.toISOString(),
    }
  })

  return { accounts, total: totals?.total ?? 0 }
}

export async function countOtherActiveAdmins(
  userId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ total: count() })
    .from(customShellUsers)
    .where(
      and(
        eq(customShellUsers.role, "admin"),
        eq(customShellUsers.status, "active"),
        ne(customShellUsers.id, userId)
      )
    )

  return row?.total ?? 0
}

/** Guards every change that could remove the last way into the admin area. */
async function requireAnotherAdmin(userId: string, database: CustomShellDb) {
  const [target] = await database
    .select({ role: customShellUsers.role })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)

  if (!target) {
    throw new Error("USER_NOT_FOUND")
  }
  if (target.role !== "admin") {
    return
  }
  if ((await countOtherActiveAdmins(userId, database)) === 0) {
    throw new Error("LAST_ADMIN")
  }
}

export async function updateUserRole(
  actorId: string,
  userId: string,
  role: "admin" | "member",
  database: CustomShellDb = db
) {
  if (role !== "admin") {
    await requireAnotherAdmin(userId, database)
  }

  const [updated] = await database
    .update(customShellUsers)
    .set({ role, updatedAt: now() })
    .where(eq(customShellUsers.id, userId))
    .returning({ id: customShellUsers.id })

  if (!updated) {
    throw new Error("USER_NOT_FOUND")
  }

  await recordAdminAudit(actorId, "update_role", "user", [userId], role, database)
  return { id: updated.id, role }
}

export async function setUserStatus(
  actorId: string,
  userId: string,
  status: "active" | "suspended",
  database: CustomShellDb = db
) {
  if (status === "suspended") {
    await requireAnotherAdmin(userId, database)
  }

  const [updated] = await database
    .update(customShellUsers)
    .set({ status, updatedAt: now() })
    .where(eq(customShellUsers.id, userId))
    .returning({ id: customShellUsers.id })

  if (!updated) {
    throw new Error("USER_NOT_FOUND")
  }

  if (status === "suspended") {
    // Drop their sessions too, so nothing keeps working on an open tab.
    await database
      .delete(customShellSessions)
      .where(eq(customShellSessions.userId, userId))
  }

  await recordAdminAudit(
    actorId,
    "update_status",
    "user",
    [userId],
    status,
    database
  )
  return { id: updated.id, status }
}

export async function deleteUserAccount(
  actorId: string,
  userId: string,
  database: CustomShellDb = db
) {
  if (actorId === userId) {
    throw new Error("CANNOT_DELETE_SELF")
  }
  await requireAnotherAdmin(userId, database)

  const [deleted] = await database
    .delete(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .returning({ id: customShellUsers.id, email: customShellUsers.email })

  if (!deleted) {
    throw new Error("USER_NOT_FOUND")
  }

  // Keep the email on the entry: the row is gone, so the id can never be looked
  // up again, and "an account was deleted" is not an audit trail.
  await recordAdminAudit(
    actorId,
    "delete",
    "user",
    [userId],
    deleted.email,
    database
  )
  return { id: deleted.id }
}

/** Bulk delete for the table's multi-selection action. Same guards, one pass. */
export async function deleteUserAccounts(
  actorId: string,
  userIds: string[],
  database: CustomShellDb = db
) {
  const targets = userIds.filter((userId) => userId !== actorId)
  if (targets.length === 0) {
    throw new Error("CANNOT_DELETE_SELF")
  }

  for (const userId of targets) {
    await requireAnotherAdmin(userId, database)
  }

  const deleted = await database
    .delete(customShellUsers)
    .where(inArray(customShellUsers.id, targets))
    .returning({ id: customShellUsers.id, email: customShellUsers.email })

  await recordAdminAudit(
    actorId,
    "delete",
    "user",
    deleted.map((row) => row.id),
    deleted.map((row) => row.email).join(", ") || null,
    database
  )

  return { deleted: deleted.length }
}

/**
 * Puts someone on a paid plan without Stripe (comp accounts, staff, refunds in
 * progress). Marked `manual` so a later Stripe event replaces it cleanly.
 */
export async function grantManualPlan(
  actorId: string,
  userId: string,
  planId: string | null,
  expiresAt: Date | null,
  database: CustomShellDb = db
) {
  if (!planId) {
    await database
      .delete(customShellSubscriptions)
      .where(
        and(
          eq(customShellSubscriptions.userId, userId),
          eq(customShellSubscriptions.source, "manual")
        )
      )

    await recordAdminAudit(
      actorId,
      "revoke_plan",
      "user",
      [userId],
      null,
      database
    )
    return { planId: null }
  }

  const plan = await getPlan(planId, database)
  if (!plan) {
    throw new Error("PLAN_NOT_FOUND")
  }

  const timestamp = now()
  const values = {
    planId: plan.id,
    status: "active",
    source: "manual" as const,
    currentPeriodEnd: expiresAt,
    cancelAtPeriodEnd: false,
    updatedAt: timestamp,
  }

  await database
    .insert(customShellSubscriptions)
    .values({
      id: uuid(),
      userId,
      interval: "monthly",
      createdAt: timestamp,
      ...values,
    })
    .onConflictDoUpdate({
      target: customShellSubscriptions.userId,
      set: values,
    })

  await recordAdminAudit(
    actorId,
    "grant_plan",
    "user",
    [userId],
    plan.slug,
    database
  )
  return { planId: plan.id }
}

export async function recordAdminAudit(
  actorId: string,
  action: string,
  resource: string,
  recordIds: string[],
  detail: string | null = null,
  // Narrowed to `insert` so an entry can be written inside a transaction as
  // well as against the pool.
  database: Pick<CustomShellDb, "insert"> = db
) {
  await database.insert(customShellAdminAuditLogs).values({
    id: uuid(),
    actorUserId: actorId,
    action,
    resource,
    recordIds,
    detail,
    createdAt: now(),
  })
}

export type RevenueSummary = {
  totalUsers: number
  verifiedUsers: number
  paidSubscribers: number
  trialing: number
  cancelling: number
  monthlyRecurringCents: number
  currency: string
  planBreakdown: {
    planId: string
    planName: string
    subscribers: number
    monthlyCents: number
  }[]
}

/**
 * Monthly recurring revenue is derived from plan prices rather than Stripe
 * invoices: yearly plans are divided by twelve, and only subscriptions that are
 * actually live count.
 */
export async function loadRevenueSummary(
  database: CustomShellDb = db
): Promise<RevenueSummary> {
  const [userTotals] = await database
    .select({
      total: count(),
      verified: sql<number>`count(${customShellUsers.emailVerifiedAt})`,
    })
    .from(customShellUsers)

  const rows = await database
    .select({
      subscription: customShellSubscriptions,
      plan: customShellPlans,
    })
    .from(customShellSubscriptions)
    .innerJoin(
      customShellPlans,
      eq(customShellPlans.id, customShellSubscriptions.planId)
    )

  const timestamp = now()
  const breakdown = new Map<
    string,
    { planId: string; planName: string; subscribers: number; monthlyCents: number }
  >()

  let paidSubscribers = 0
  let trialing = 0
  let cancelling = 0
  let monthlyRecurringCents = 0
  let currency = "usd"

  for (const row of rows) {
    if (!subscriptionIsActive(row.subscription, timestamp)) {
      continue
    }

    paidSubscribers += 1
    currency = row.plan.currency
    if (row.subscription.status === "trialing") trialing += 1
    if (row.subscription.cancelAtPeriodEnd) cancelling += 1

    const monthlyCents =
      row.subscription.interval === "yearly"
        ? Math.round(row.plan.priceYearlyCents / 12)
        : row.plan.priceMonthlyCents

    monthlyRecurringCents += monthlyCents

    const entry = breakdown.get(row.plan.id) ?? {
      planId: row.plan.id,
      planName: row.plan.name,
      subscribers: 0,
      monthlyCents: 0,
    }
    entry.subscribers += 1
    entry.monthlyCents += monthlyCents
    breakdown.set(row.plan.id, entry)
  }

  return {
    totalUsers: userTotals?.total ?? 0,
    verifiedUsers: Number(userTotals?.verified ?? 0),
    paidSubscribers,
    trialing,
    cancelling,
    monthlyRecurringCents,
    currency,
    planBreakdown: [...breakdown.values()].sort(
      (a, b) => b.monthlyCents - a.monthlyCents
    ),
  }
}
