import {
  BarChart3Icon,
  CircleDollarSignIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import type { StatFigure } from "@/components/shared/stat-strip"
import type { MembershipSummary } from "@/lib/api/membership"
import { formatMoney } from "@/lib/money"
import { percentChange } from "@/lib/percent-change"
import { plural } from "@/lib/plural"

/** The four figures the Membership page opens with. */
export function buildMembershipFigures(
  summary: MembershipSummary
): StatFigure[] {
  const { revenue } = summary

  return [
    {
      key: "people",
      to: "/admin/users",
      icon: UsersIcon,
      label: "People",
      value: revenue.totalUsers.toLocaleString(),
      // The only honest month-on-month figure in the app: joining dates are on
      // the row, so last month's total can be counted back to.
      before: `${summary.accountsLastMonth.toLocaleString()} at the end of last month`,
      change: percentChange(summary.accountsLastMonth, revenue.totalUsers),
      footer: peopleFooter(summary),
    },
    {
      key: "joined",
      to: "/admin/users",
      icon: UserPlusIcon,
      label: "Joined this month",
      value: summary.newThisMonth.toLocaleString(),
      before: `${summary.newLastMonth.toLocaleString()} joined last month`,
      change: percentChange(summary.newLastMonth, summary.newThisMonth),
      footer: null,
    },
    {
      key: "paying",
      to: "/admin/billing",
      icon: BarChart3Icon,
      label: "Paying",
      value: revenue.paidSubscribers.toLocaleString(),
      // These two carry a plain fact where the others carry last month's
      // figure, because there is no last month to carry. A subscription keeps
      // one `updated_at` that Stripe overwrites on every change, so what
      // somebody was paying in June is not written down anywhere — and a badge
      // reading "+0% vs last month" would be a number the app made up.
      before: `${revenue.paidSubscribers.toLocaleString()} of ${revenue.totalUsers.toLocaleString()} ${plural(revenue.totalUsers, "account")}`,
      change: null,
      footer: `${revenue.trialing} on a trial, ${revenue.cancelling} ending`,
    },
    {
      key: "revenue",
      to: "/admin/plans",
      icon: CircleDollarSignIcon,
      label: "Revenue a month",
      value: formatMoney(revenue.monthlyRecurringCents, revenue.currency),
      // Averaging what nobody pays over nobody is not a figure, it is a zero
      // pretending to be one.
      before: revenue.paidSubscribers
        ? `${formatMoney(summary.arpuCents, revenue.currency)} from each`
        : null,
      change: null,
      footer: `${summary.paidPlans} of ${summary.livePlans} plans cost money`,
    },
  ]
}

/** "12 members, 2 admins" — and the suspended, only while there are any. */
function peopleFooter(summary: MembershipSummary) {
  const parts = [
    `${summary.members} ${plural(summary.members, "member")}`,
    `${summary.admins} ${plural(summary.admins, "admin")}`,
  ]
  if (summary.suspended > 0) parts.push(`${summary.suspended} suspended`)
  return parts.join(", ")
}
