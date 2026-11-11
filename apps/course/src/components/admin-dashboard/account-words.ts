import { describeCode } from "@/lib/format/code-label"
import { ACCOUNT_RESTORE_DAYS, isPendingDeletion, restoreDeadline } from "@/lib/account-deletion"
import type { AccountDetail, AccountRow } from "@/lib/api/people/admin-users"
import { pausedPlanLabel } from "@/lib/billing/pause-rules"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { plural } from "@/lib/format/plural"

/**
 * The words the Users tab says about an account: in its row, on the right
 * panel and in its confirmations. Kept in one place so the list and the
 * panel never describe one person two ways.
 */

/** What a confirmation needs to know about the account it is about. */
export type AccountTarget = {
  id: string
  name: string
  email: string
  role: string
  status: string
  /** A paid plan, or a paused one Stripe still holds. */
  paying: boolean
}

export function targetOfRow(account: AccountRow): AccountTarget {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
    paying: account.planIsPaid || account.paused,
  }
}

export function targetOfDetail(detail: AccountDetail): AccountTarget {
  return {
    id: detail.profile.id,
    name: detail.profile.name,
    email: detail.profile.email,
    role: detail.profile.role,
    status: detail.profile.status,
    paying: detail.subscription.isPaid || detail.subscription.paused,
  }
}

/**
 * Why View as member is refused for this account, or null when it is not. The
 * server refuses the same accounts again; this says so before asking.
 */
export function viewAsRefusal(account: AccountTarget) {
  if (account.role === "admin") return "You cannot view the app as another admin."
  if (isPendingDeletion(account)) return "This account is scheduled for deletion. Restore it first."
  if (account.status !== "active") return "This account is suspended. Set it back to active first."
  return null
}

/**
 * What deleting these accounts did, said plainly. The same action both marks
 * an account and, on a second go, removes one for good, so a mixed selection
 * reports both.
 */
export function describeDeletion({ marked, deleted }: { marked: number; deleted: number }) {
  const parts = []
  if (marked) parts.push(`${marked} ${plural(marked, "account", "accounts")} scheduled for deletion`)
  if (deleted) parts.push(`${deleted} deleted for good`)
  return parts.length ? `${parts.join(", ")}.` : "Nothing to delete."
}

/**
 * What a bulk delete confirmation says about paid plans. Deleting cancels them
 * there and then, and restoring the account does not buy them back, so both
 * are on screen before the button is pressed.
 */
export function describePaidPlans(paid: number) {
  if (paid === 0) return ""
  if (paid === 1) {
    return " One of them is on a paid plan; it is cancelled straight away and does not come back if the account is restored."
  }
  return ` ${paid} of them are on paid plans; those are cancelled straight away and do not come back if the accounts are restored.`
}

export function describeAccountDeletion(account: AccountTarget) {
  const base = isPendingDeletion(account)
    ? `${account.name} (${account.email}) and everything they own is removed now, without waiting out the rest of the restore window. This cannot be undone.`
    : `${account.name} (${account.email}) is signed out everywhere and cannot sign in. You can restore them for ${ACCOUNT_RESTORE_DAYS} days, after which they and everything they own are gone for good.`
  // A paused plan counts: Stripe still holds it, so deleting the account
  // cancels it too.
  return account.paying
    ? `${base} Their paid plan is cancelled straight away, and restoring the account does not bring it back.`
    : base
}

/**
 * The one word in the Plan column. A paused account is on the free plan, so
 * without this it would look like somebody who never paid.
 */
export function planCellLabel(account: AccountRow) {
  return account.paused ? pausedPlanLabel(account.pausedPlanName) : account.planName
}

type AccountStanding = "active" | "waiting" | "stopped" | "leaving"

/**
 * An account's standing as one word and the colour of its row's dot. An
 * account with nothing wrong says "Active" instead of saying nothing.
 */
export function accountStatusWords(account: AccountRow): { label: string; standing: AccountStanding } {
  if (isPendingDeletion(account) && account.deletedAt) {
    return { label: `Deletes ${formatDate(restoreDeadline(account.deletedAt))}`, standing: "leaving" }
  }
  if (account.status === "suspended") return { label: "Suspended", standing: "stopped" }
  if (account.lockedOut) return { label: "Locked out", standing: "stopped" }
  // No password and no verified email: an invited account whose set-password
  // link has not been used yet.
  if (!account.emailVerified) return { label: account.hasPassword ? "Not verified" : "Invited", standing: "waiting" }
  return { label: "Active", standing: "active" }
}

/** The dot colours, in Project's palette as the CRM's rows use it. */
export const STANDING_DOT: Record<AccountStanding, string> = {
  active: "bg-green-600",
  waiting: "bg-amber-500",
  stopped: "bg-red-500",
  leaving: "bg-muted-foreground/50",
}

/**
 * The ceiling this account runs under, and where it comes from: their own
 * number beats their plan's, and no number anywhere means no limit.
 */
export function aiAllowanceText(allowance: { overrideCents: number | null; planCents: number | null }) {
  if (allowance.overrideCents !== null) return `${formatMoney(allowance.overrideCents)} a month, set just for them`
  if (allowance.planCents !== null) return `${formatMoney(allowance.planCents)} a month, from their plan`
  return "No limit"
}

/** Stripe's own words, said the way somebody reading a support ticket would. */
export function subscriptionStatusText(status: string) {
  const labels: Record<string, string> = {
    active: "Active",
    trialing: "On a trial",
    past_due: "Payment overdue",
    canceled: "Cancelled",
    incomplete: "Payment never finished",
    incomplete_expired: "Payment expired",
    unpaid: "Payment overdue",
    none: "No subscription",
  }
  return labels[status] ?? describeCode(status)
}
