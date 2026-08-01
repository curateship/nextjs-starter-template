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

import { PENDING_DELETION } from "@/lib/account-deletion"
import {
  markAccountsForDeletion,
  restoreAccounts,
} from "@/server/account-deletion"
import { db, type CustomShellDb } from "@/server/db"
import { subscriptionIsActive } from "@/server/entitlements"
import { getDefaultPlan, getPlan } from "@/server/plans"
import {
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
  status: "all" | "active" | "suspended" | "pending_deletion"
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
  /** When this account was marked for deletion, and null when it was not. */
  deletedAt: string | null
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
      deletedAt: row.user.deletedAt?.toISOString() ?? null,
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

/** The status on an account, or null when there is no such account. */
async function findAccountStatus(userId: string, database: CustomShellDb) {
  const [row] = await database
    .select({ status: customShellUsers.status })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)

  return row?.status ?? null
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

  return { id: updated.id, role }
}

export async function setUserStatus(
  userId: string,
  status: "active" | "suspended",
  database: CustomShellDb = db
) {
  if (status === "suspended") {
    await requireAnotherAdmin(userId, database)
  }

  // An account on its way out is not suspended or unsuspended from here. Its
  // status is the deletion clock, and the only two things that may move it are
  // restoring the account and purging it.
  const [updated] = await database
    .update(customShellUsers)
    .set({ status, updatedAt: now() })
    .where(
      and(
        eq(customShellUsers.id, userId),
        ne(customShellUsers.status, PENDING_DELETION)
      )
    )
    .returning({ id: customShellUsers.id })

  if (!updated) {
    throw new Error(
      (await findAccountStatus(userId, database)) === PENDING_DELETION
        ? "ACCOUNT_PENDING_DELETION"
        : "USER_NOT_FOUND"
    )
  }

  if (status === "suspended") {
    // Drop their sessions too, so nothing keeps working on an open tab.
    await database
      .delete(customShellSessions)
      .where(eq(customShellSessions.userId, userId))
  }

  return { id: updated.id, status }
}

/**
 * What deleting accounts did: how many were marked for deletion, and how many
 * were removed outright.
 *
 * Both happen through the same button. An ordinary account is marked and starts
 * its restore window; one that is already marked is the admin saying "no, now",
 * so it goes for good. That second case is also the manual purge — an admin
 * never has to wait out somebody's window.
 */
export type AccountDeletionResult = { marked: number; deleted: number }

export async function deleteUserAccount(
  actorId: string,
  userId: string,
  database: CustomShellDb = db
): Promise<AccountDeletionResult> {
  return deleteUserAccounts(actorId, [userId], database)
}

/** Bulk delete for the table's multi-selection action. Same guards, one pass. */
export async function deleteUserAccounts(
  actorId: string,
  userIds: string[],
  database: CustomShellDb = db
): Promise<AccountDeletionResult> {
  const targets = userIds.filter((userId) => userId !== actorId)
  if (targets.length === 0) {
    throw new Error("CANNOT_DELETE_SELF")
  }

  const rows = await database
    .select({ id: customShellUsers.id, status: customShellUsers.status })
    .from(customShellUsers)
    .where(inArray(customShellUsers.id, targets))

  if (rows.length === 0) {
    throw new Error("USER_NOT_FOUND")
  }

  for (const row of rows) {
    await requireAnotherAdmin(row.id, database)
  }

  const alreadyMarked = rows
    .filter((row) => row.status === PENDING_DELETION)
    .map((row) => row.id)
  const toMark = rows
    .filter((row) => row.status !== PENDING_DELETION)
    .map((row) => row.id)

  const marked = toMark.length
    ? await markAccountsForDeletion(actorId, toMark, database)
    : []

  const deleted = alreadyMarked.length
    ? await database
        .delete(customShellUsers)
        .where(inArray(customShellUsers.id, alreadyMarked))
        .returning({ id: customShellUsers.id })
    : []

  return { marked: marked.length, deleted: deleted.length }
}

/** Brings marked accounts back. Anything out of time is left alone. */
export async function restoreUserAccounts(
  userIds: string[],
  database: CustomShellDb = db
) {
  const restored = await restoreAccounts(userIds, database)

  if (restored.length === 0) {
    throw new Error("RESTORE_WINDOW_PASSED")
  }

  return { restored: restored.length }
}

/**
 * Puts someone on a paid plan without Stripe (comp accounts, staff, refunds in
 * progress). Marked `manual` so a later Stripe event replaces it cleanly.
 */
export async function grantManualPlan(
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

  return { planId: plan.id }
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
