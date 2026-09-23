import type { StatFigure } from "@/components/shared/dashboard/stat-strip"
import type { MembershipSummary } from "@/lib/api/admin-overview"
import { formatSharePercent } from "@/lib/format/format-number"
import { formatMoney } from "@/lib/format/money"
import { percentChange } from "@/lib/format/percent-change"
import { plural } from "@/lib/format/plural"

/**
 * Said where a change would be on the two money figures, because there is no
 * last month to compare with. A subscription keeps one `updated_at` that Stripe
 * overwrites on every change, so what somebody was paying in June is not
 * written down anywhere, and "+0% vs last month" would be a number the app
 * made up. For the same reason those two figures draw no line.
 */
const NO_HISTORY = "No history kept"

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
      change: percentChange(summary.accountsLastMonth, revenue.totalUsers),
      changeCaption: "vs last month",
      changeNote: "None last month",
      trend: summary.last30Days.map((day) => day.people),
      footer: peopleFooter(summary),
    },
    {
      key: "joined",
      to: "/admin/users",
      label: "Joined this month",
      value: summary.newThisMonth.toLocaleString(),
      change: percentChange(summary.newLastMonth, summary.newThisMonth),
      changeCaption: "vs last month",
      changeNote: "None last month",
      trend: summary.last30Days.map((day) => day.joined),
      footer: `${summary.newThisMonth.toLocaleString()} of ${revenue.totalUsers.toLocaleString()} ${plural(revenue.totalUsers, "person", "people")}`,
    },
    {
      key: "paying",
      // The Plans page, same as the revenue tile below it: who is paying is a
      // question about the plans they are on.
      to: "/admin/plans",
      label: "Paying",
      value: revenue.paidSubscribers.toLocaleString(),
      changeNote: NO_HISTORY,
      footer: [
        `${formatSharePercent(revenue.paidSubscribers, revenue.totalUsers)} of accounts`,
        `${revenue.trialing} on trial`,
        `${revenue.cancelling} ending`,
      ],
    },
    {
      key: "revenue",
      to: "/admin/plans",
      label: "Revenue a month",
      value: formatMoney(revenue.monthlyRecurringCents, revenue.currency),
      changeNote: NO_HISTORY,
      footer: [
        // Averaging what nobody pays over nobody is not a figure, it is a zero
        // pretending to be one.
        revenue.paidSubscribers
          ? `${formatMoney(summary.arpuCents, revenue.currency)} each`
          : null,
        `${summary.paidPlans} of ${summary.livePlans} plans paid`,
      ],
    },
  ]
}

/** "12 members, 2 admins, 1 suspended" — the suspended only while there are any. */
function peopleFooter(summary: MembershipSummary) {
  const parts = [
    `${summary.members} ${plural(summary.members, "member")}`,
    `${summary.admins} ${plural(summary.admins, "admin")}`,
  ]
  if (summary.suspended > 0) parts.push(`${summary.suspended} suspended`)
  return parts
}
