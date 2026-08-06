import type { StatFigure } from "@/components/shared/dashboard/stat-strip"
import type { MembershipSummary } from "@/lib/api/admin-overview"
import { formatMoney } from "@/lib/format/money"
import { percentChange } from "@/lib/format/percent-change"
import { plural } from "@/lib/format/plural"

/** The four member-and-money figures the Overview's stat strip opens with. */
export function buildMembershipFigures(
  summary: MembershipSummary
): StatFigure[] {
  const { revenue } = summary

  return [
    {
      key: "people",
      to: "/admin/users",
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
      label: "Joined this month",
      value: summary.newThisMonth.toLocaleString(),
      before: `${summary.newLastMonth.toLocaleString()} joined last month`,
      change: percentChange(summary.newLastMonth, summary.newThisMonth),
      footer: null,
    },
    {
      key: "paying",
      // The Plans page, same as the revenue tile below it: who is paying is a
      // question about the plans they are on, and the Membership page this
      // used to open is gone.
      to: "/admin/plans",
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

/** "12 members, 2 admins, 10 verified" — the suspended only while there are any. */
function peopleFooter(summary: MembershipSummary) {
  const parts = [
    `${summary.members} ${plural(summary.members, "member")}`,
    `${summary.admins} ${plural(summary.admins, "admin")}`,
  ]
  if (summary.suspended > 0) parts.push(`${summary.suspended} suspended`)
  // Carried over from the Revenue page's own stat cards when that page was
  // folded in here, so the figure did not go missing with the page.
  parts.push(`${summary.revenue.verifiedUsers} verified`)
  return parts.join(", ")
}
