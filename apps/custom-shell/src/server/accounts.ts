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
  purgeExpiredDeletions,
  restoreAccounts,
} from "@/server/account-deletion"
import { appUrlFor } from "@/server/app-url"
import {
  cancelSubscriptionsForDeletion,
  type CancelApi,
} from "@/server/billing"
import { db, type CustomShellDb } from "@/server/db"
import { sendAuthEmail } from "@/server/email"
import { subscriptionIsActive } from "@/server/entitlements"
import { getDefaultPlan, getPlan } from "@/server/plans"
import {
  customShellAiAllowanceOverrides,
  customShellPlans,
  customShellSessions,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import {
  createAuthToken,
  findUserByEmail,
  now,
  uuid,
} from "@/server/security"
import { recordSubscriptionEvent } from "@/server/subscription-events"

export type AccountSort =
  | "name"
  | "email"
  | "role"
  | "status"
  | "plan"
  | "created"

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
  /**
   * False for an account that has never had a password set. Together with an
   * unverified email that is the invited-but-not-arrived state — the table
   * says so instead of showing a person who looks ready to sign in.
   */
  hasPassword: boolean
  planName: string
  planSlug: string
  planIsPaid: boolean
  subscriptionStatus: string | null
  subscriptionSource: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** Their own monthly AI ceiling in cents, null when they follow their plan. */
  aiOverrideCents: number | null
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
    // The Status column shows a computed standing (active, not verified,
    // invited, suspended, deleting), so its sort ranks the same ladder rather
    // than the raw status word.
    status: sql`case
      when ${customShellUsers.status} = 'pending_deletion' then 4
      when ${customShellUsers.status} = 'suspended' then 3
      when ${customShellUsers.emailVerifiedAt} is null
        and coalesce(${customShellUsers.passwordHash}, '') = '' then 2
      when ${customShellUsers.emailVerifiedAt} is null then 1
      else 0
    end`,
    plan: customShellPlans.name,
    created: customShellUsers.createdAt,
  }[query.sort]

  const rows = await database
    .select({
      user: customShellUsers,
      subscription: customShellSubscriptions,
      plan: customShellPlans,
      aiOverride: customShellAiAllowanceOverrides,
    })
    .from(customShellUsers)
    .leftJoin(
      customShellAiAllowanceOverrides,
      eq(customShellAiAllowanceOverrides.userId, customShellUsers.id)
    )
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

  const accounts = rows.map((row) => toAccountRow(row, defaultPlan, timestamp))

  return { accounts, total: totals?.total ?? 0 }
}

/** One joined user row as the admin tables read it. */
type AccountJoin = {
  user: typeof customShellUsers.$inferSelect
  subscription: typeof customShellSubscriptions.$inferSelect | null
  plan: typeof customShellPlans.$inferSelect | null
  aiOverride?: typeof customShellAiAllowanceOverrides.$inferSelect | null
}

/**
 * The one place a joined row becomes an `AccountRow`. Somebody without a live
 * paid subscription reads as being on the default plan, whether or not they
 * have a subscription row at all.
 */
function toAccountRow(
  row: AccountJoin,
  defaultPlan: { name: string; slug: string } | null | undefined,
  timestamp: Date
): AccountRow {
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
    hasPassword: Boolean(row.user.passwordHash),
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
    aiOverrideCents: row.aiOverride?.monthlyCents ?? null,
    createdAt: row.user.createdAt.toISOString(),
  }
}

/**
 * The newest accounts, for the Overview's table.
 *
 * Deliberately not `listAccounts` with a page size of five: that is three
 * round trips — the rows, then `count(*)`, then the default plan — and the
 * Overview needs neither the count nor a second plan read, because the page
 * has already read every plan. This is one query.
 */
export async function loadNewestAccounts(
  limit: number,
  defaultPlan: { name: string; slug: string } | null | undefined,
  database: CustomShellDb = db
): Promise<AccountRow[]> {
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
    .orderBy(desc(customShellUsers.createdAt))
    .limit(limit)

  const timestamp = now()
  return rows.map((row) => toAccountRow(row, defaultPlan, timestamp))
}

/**
 * Adds a person directly, instead of waiting for them to register themselves.
 *
 * The account starts with no password at all — nothing typed can match a null
 * hash, so nobody can sign in to it until the emailed link has set one. The
 * link is the same one a password reset sends, and spending it does two things
 * at once: sets the password, and marks the email verified, because opening a
 * link that was mailed to the address proves the inbox is theirs.
 */
export async function createAccountByAdmin(
  email: string,
  name: string,
  role: "admin" | "member",
  database: CustomShellDb = db
) {
  // An address stays taken while a deleted account holding it can still be
  // restored, and frees up the moment that account is really gone — the same
  // order registration checks in.
  await purgeExpiredDeletions(database)

  if (await findUserByEmail(email, database)) {
    throw new Error("ACCOUNT_EXISTS")
  }

  const createdAt = now()
  const { userId, token } = await database.transaction(async (tx) => {
    const [user] = await tx
      .insert(customShellUsers)
      .values({
        id: uuid(),
        email,
        name,
        role,
        status: "active",
        passwordHash: null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: customShellUsers.id })

    return {
      userId: user.id,
      token: await createAuthToken(user.id, "reset_password", tx),
    }
  })

  let delivered: boolean
  try {
    delivered = (
      await sendAuthEmail({
        kind: "new-account",
        to: email,
        actionUrl: appUrlFor(`/reset-password?token=${encodeURIComponent(token)}`),
      })
    ).delivered
  } catch (deliveryError) {
    // The mail never went out, so the person could never get in. Dropping the
    // fresh row lets the admin simply try again, instead of being told the
    // account already exists when nobody can reach it.
    await database
      .delete(customShellUsers)
      .where(eq(customShellUsers.id, userId))
    throw deliveryError
  }

  // `delivered` is false only in development with email switched off, where
  // the link is printed to the server log instead — the dialog says which
  // happened so nobody waits on a mail that is not coming.
  return { id: userId, delivered }
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
  database: CustomShellDb = db,
  api?: CancelApi
): Promise<AccountDeletionResult> {
  return deleteUserAccounts(actorId, [userId], database, api)
}

/** Bulk delete for the table's multi-selection action. Same guards, one pass. */
export async function deleteUserAccounts(
  actorId: string,
  userIds: string[],
  database: CustomShellDb = db,
  api?: CancelApi
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

  // After the guards and before anything is removed: a plan cancelled for a
  // delete that then failed on "last admin" would be a plan taken away for
  // nothing. If Stripe refuses this, nothing below runs.
  await cancelSubscriptionsForDeletion(
    rows.map((row) => row.id),
    database,
    api
  )

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
    const [removed] = await database
      .delete(customShellSubscriptions)
      .where(
        and(
          eq(customShellSubscriptions.userId, userId),
          eq(customShellSubscriptions.source, "manual")
        )
      )
      .returning({ planId: customShellSubscriptions.planId })

    // Only when there was actually a grant to take away. Saving "no granted
    // plan" on an account that never had one changed nothing, and a history
    // entry for it would be a lie.
    if (removed) {
      const previous = removed.planId
        ? await getPlan(removed.planId, database)
        : null

      await recordSubscriptionEvent(database, {
        userId,
        kind: "grant_removed",
        planName: previous?.name ?? null,
        source: "admin",
      })
    }

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

  await recordSubscriptionEvent(
    database,
    {
      userId,
      kind: "plan_granted",
      planName: plan.name,
      detail: expiresAt?.toISOString() ?? null,
      source: "admin",
    },
    timestamp
  )

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
  /**
   * How many people are paying for each plan. It used to carry that plan's
   * share of the money too, for a revenue-by-plan card on the Membership page —
   * both that card and that page are gone, and the app-wide total below is the
   * only money figure anything still shows.
   */
  planBreakdown: {
    planId: string
    planName: string
    subscribers: number
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
    { planId: string; planName: string; subscribers: number }
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
    }
    entry.subscribers += 1
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
    // Biggest plan first. It used to sort by that plan's money, which is gone;
    // people is the same ranking for anyone paying one price per plan, and the
    // only one still available.
    planBreakdown: [...breakdown.values()].sort(
      (a, b) => b.subscribers - a.subscribers
    ),
  }
}
