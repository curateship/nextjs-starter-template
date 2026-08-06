import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "../error-message"
import { z } from "zod"

import { loadAccountDetail, type AccountDetail } from "@/server/people/account-detail"
import {
  createAccountByAdmin,
  deleteUserAccount,
  deleteUserAccounts,
  grantManualPlan,
  listAccounts,
  restoreUserAccounts,
  setUserStatus,
  updateUserRole,
  type AccountRow,
} from "@/server/people/accounts"
import {
  cancelSubscriptionByAdmin,
  type CancelSubscriptionMode,
} from "@/server/billing/stripe"
import { listPlans } from "@/server/billing/plans"
import { adminGet, adminPost } from "@/server/guards"
import { readDashboardRowsPerPage } from "@/server/shell-settings"

// Types only — a runtime value re-exported from @/server/* would drag the
// database driver into the browser bundle and kill hydration app-wide.
export type {
  AccountDetail,
  AccountRow,
  CancelSubscriptionMode,
}

/** Plans an admin can hand out by hand, as the account modal lists them. */
export type AssignablePlan = { id: string; name: string; slug: string }

const listQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  role: z.enum(["all", "admin", "member"]).default("all"),
  status: z
    .enum(["all", "active", "suspended", "pending_deletion", "locked_out"])
    .default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  sort: z
    .enum(["name", "email", "role", "status", "plan", "created"])
    .default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export type AccountListQueryInput = z.input<typeof listQuerySchema>

export const getAdminUserErrorMessage = createErrorMessage(
  {
    USER_NOT_FOUND: "That account no longer exists.",
    ACCOUNT_EXISTS: "An account already exists for this email.",
    EMAIL_NOT_CONFIGURED: "Email delivery is not configured yet.",
    EMAIL_DELIVERY_FAILED:
      "We could not send the set-password email, so the account was not created. Please try again.",
    LAST_ADMIN: "You cannot remove the last admin.",
    CANNOT_DELETE_SELF: "You cannot delete your own account here.",
    PLAN_NOT_FOUND: "That plan no longer exists.",
    SUBSCRIPTION_NOT_FOUND: "This account has no paid plan to cancel.",
    SUBSCRIPTION_CANCEL_FAILED:
      "Stripe would not cancel a paid plan on one of those accounts, so nothing was deleted. Please try again in a moment.",
    ALREADY_ENDING:
      "This plan is already set to end when the paid period runs out.",
    BILLING_NOT_CONFIGURED:
      "Stripe is not set up here, so this subscription cannot be cancelled from this screen.",
    ACCOUNT_PENDING_DELETION:
      "That account is scheduled for deletion. Restore it first.",
    RESTORE_WINDOW_PASSED:
      "That account was deleted too long ago to bring back.",
  },
  "We could not update that account. Please try again."
)

const listAccountsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listQuerySchema)
  .handler(async ({ data }) => {
    return listAccounts(data)
  })

/**
 * Users page data in one request: the first page of accounts.
 *
 * The page size is not passed in — the loader cannot know the configured
 * rows-per-page without another round trip, so it is read here and sent back,
 * which is what keeps the rows on screen and the footer's "1-10 of N" agreeing
 * on first paint.
 *
 * No plans: the account window loads its own, so the list does not fetch them
 * on every page turn against the chance that somebody opens one.
 */
const loadAdminUsersPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    const accounts = await listAccounts({ ...data, pageSize })

    return { accounts, pageSize }
  })

/**
 * One account's window in one request: the person, their plan and their
 * storage, plus the plans that can be granted — so the window needs nothing
 * from whoever opened it beyond an id.
 */
const loadAccountDetailFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data }) => {
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
  .middleware([adminPost])
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
    return createAccountByAdmin(data.email, data.name, data.role)
  })

const updateRoleFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      role: z.enum(["admin", "member"]),
    })
  )
  .handler(async ({ data }) => {
    return updateUserRole(data.userId, data.role)
  })

const updateStatusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      status: z.enum(["active", "suspended"]),
    })
  )
  .handler(async ({ data }) => {
    return setUserStatus(data.userId, data.status)
  })

const grantPlanFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      planId: z.string().min(1).max(36).nullable(),
      expiresAt: z.string().datetime().nullable().default(null),
    })
  )
  .handler(async ({ data }) => {
    return grantManualPlan(
      data.userId,
      data.planId,
      data.expiresAt ? new Date(data.expiresAt) : null
    )
  })

const cancelSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      mode: z.enum(["period_end", "immediate"]),
    })
  )
  .handler(async ({ data }) => {
    return cancelSubscriptionByAdmin(data.userId, data.mode)
  })

const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    return deleteUserAccount(context.user.id, data.userId)
  })

const deleteAccountsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ userIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data, context }) => {
    return deleteUserAccounts(context.user.id, data.userIds)
  })

const restoreAccountsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ userIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data }) => {
    return restoreUserAccounts(data.userIds)
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
