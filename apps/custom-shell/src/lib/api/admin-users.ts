import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { loadAccountDetail, type AccountDetail } from "@/server/account-detail"
import {
  createAccountByAdmin,
  deleteUserAccount,
  deleteUserAccounts,
  grantManualPlan,
  listAccounts,
  loadRevenueSummary,
  restoreUserAccounts,
  setUserStatus,
  updateUserRole,
  type AccountRow,
  type RevenueSummary,
} from "@/server/accounts"
import {
  cancelSubscriptionByAdmin,
  type CancelSubscriptionMode,
} from "@/server/billing"
import { listPlans } from "@/server/plans"
import { requireAppOrigin } from "@/server/origin"
import { requireAdmin } from "@/server/security"
import { readDashboardRowsPerPage } from "@/server/shell-settings"

// Types only — a runtime value re-exported from @/server/* would drag the
// database driver into the browser bundle and kill hydration app-wide.
export type { AccountDetail, AccountRow, CancelSubscriptionMode, RevenueSummary }

/** Plans an admin can hand out by hand, as the account modal lists them. */
export type AssignablePlan = { id: string; name: string; slug: string }

const listQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  role: z.enum(["all", "admin", "member"]).default("all"),
  status: z
    .enum(["all", "active", "suspended", "pending_deletion"])
    .default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  sort: z.enum(["name", "email", "role", "plan", "created"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export type AccountListQueryInput = z.input<typeof listQuerySchema>

const adminUserErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
  USER_NOT_FOUND: "That account no longer exists.",
  ACCOUNT_EXISTS: "An account already exists for this email.",
  EMAIL_NOT_CONFIGURED: "Email delivery is not configured yet.",
  EMAIL_DELIVERY_FAILED:
    "We could not send the set-password email, so the account was not created. Please try again.",
  LAST_ADMIN: "You cannot remove the last admin.",
  CANNOT_DELETE_SELF: "You cannot delete your own account here.",
  PLAN_NOT_FOUND: "That plan no longer exists.",
  SUBSCRIPTION_NOT_FOUND: "This account has no paid plan to cancel.",
  ALREADY_ENDING:
    "This plan is already set to end when the paid period runs out.",
  BILLING_NOT_CONFIGURED:
    "Stripe is not set up here, so this subscription cannot be cancelled from this screen.",
  ACCOUNT_PENDING_DELETION:
    "That account is scheduled for deletion. Restore it first.",
  RESTORE_WINDOW_PASSED:
    "That account was deleted too long ago to bring back.",
}

export function getAdminUserErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(adminUserErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? adminUserErrorMessages[matched]
    : "We could not complete that request. Please try again."
}

const listAccountsFn = createServerFn({ method: "GET" })
  .inputValidator(listQuerySchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    return listAccounts(data)
  })

/**
 * Users page data in one request: the first page of accounts plus the plans.
 *
 * The page size is not passed in — the loader cannot know the configured
 * rows-per-page without another round trip, so it is read here and sent back,
 * which is what keeps the rows on screen and the footer's "1-10 of N" agreeing
 * on first paint.
 */
const loadAdminUsersPageFn = createServerFn({ method: "GET" })
  .inputValidator(listQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const [pageSize, plans] = await Promise.all([
      readDashboardRowsPerPage(),
      listPlans(),
    ])
    const accounts = await listAccounts({ ...data, pageSize })

    return { accounts, pageSize, plans: toAssignablePlans(plans) }
  })

/**
 * One account's page in one request: the person, their plan, their storage,
 * their feedback and what admins have done to them, plus the plans so the
 * account modal opens from here too.
 */
const loadAccountDetailFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const detail = await loadAccountDetail(data.userId)
    return { detail, plans: toAssignablePlans(await listPlans()) }
  })

function toAssignablePlans(
  plans: Awaited<ReturnType<typeof listPlans>>
): AssignablePlan[] {
  return plans
    .filter((plan) => plan.active && !plan.isDefault)
    .map((plan) => ({ id: plan.id, name: plan.name, slug: plan.slug }))
}

const createAccountFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      // Mirrors the registration form's email rule, lowercasing included, so
      // the duplicate check compares like with like.
      email: z.string().trim().toLowerCase().min(3).max(255).email(),
      name: z.string().trim().min(1).max(255),
      role: z.enum(["admin", "member"]),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return createAccountByAdmin(data.email, data.name, data.role)
  })

const updateRoleFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      role: z.enum(["admin", "member"]),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return updateUserRole(data.userId, data.role)
  })

const updateStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      status: z.enum(["active", "suspended"]),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return setUserStatus(data.userId, data.status)
  })

const grantPlanFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      planId: z.string().min(1).max(36).nullable(),
      expiresAt: z.string().datetime().nullable().default(null),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return grantManualPlan(
      data.userId,
      data.planId,
      data.expiresAt ? new Date(data.expiresAt) : null
    )
  })

const cancelSubscriptionFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      mode: z.enum(["period_end", "immediate"]),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return cancelSubscriptionByAdmin(data.userId, data.mode)
  })

const deleteAccountFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    const actor = await requireAdmin()
    return deleteUserAccount(actor.id, data.userId)
  })

const deleteAccountsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ userIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    const actor = await requireAdmin()
    return deleteUserAccounts(actor.id, data.userIds)
  })

const restoreAccountsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ userIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return restoreUserAccounts(data.userIds)
  })

const loadRevenueFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin()
  return loadRevenueSummary()
})

export function loadAdminUsersPage(
  query: Omit<AccountListQueryInput, "pageSize">
) {
  return loadAdminUsersPageFn({ data: query })
}

export function loadAdminAccountDetail(userId: string) {
  return loadAccountDetailFn({ data: { userId } })
}

export function listAdminAccounts(query: AccountListQueryInput) {
  return listAccountsFn({ data: query })
}

export function createAccountAsAdmin(
  email: string,
  name: string,
  role: "admin" | "member"
) {
  return createAccountFn({ data: { email, name, role } })
}

export function updateAccountRole(userId: string, role: "admin" | "member") {
  return updateRoleFn({ data: { userId, role } })
}

export function updateAccountStatus(
  userId: string,
  status: "active" | "suspended"
) {
  return updateStatusFn({ data: { userId, status } })
}

export function grantAccountPlan(
  userId: string,
  planId: string | null,
  expiresAt: string | null = null
) {
  return grantPlanFn({ data: { userId, planId, expiresAt } })
}

export function cancelAccountSubscription(
  userId: string,
  mode: CancelSubscriptionMode
) {
  return cancelSubscriptionFn({ data: { userId, mode } })
}

export function deleteAccountAsAdmin(userId: string) {
  return deleteAccountFn({ data: { userId } })
}

export function deleteAccountsAsAdmin(userIds: string[]) {
  return deleteAccountsFn({ data: { userIds } })
}

export function restoreAccountsAsAdmin(userIds: string[]) {
  return restoreAccountsFn({ data: { userIds } })
}

export function loadRevenue() {
  return loadRevenueFn()
}
