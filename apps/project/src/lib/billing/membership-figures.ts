import type { StatFigure } from "@/components/shared/dashboard/stat-strip"
import type { MembershipSummary } from "@/lib/api/admin-overview"
import { formatMoney } from "@/lib/format/money"
import { percentChange } from "@/lib/format/percent-change"

/**
 * Said where a change would be on the two money figures, because there is no
 * last month to compare with. A subscription keeps one `updated_at` that Stripe
 * overwrites on every change, so what somebody was paying in June is not
 * written down anywhere, and "+0% vs last month" would be a number the app
 * made up. For the same reason those two figures draw no line.
 */
const NO_HISTORY = "No history kept"

/** What "Joined this month" is compared with, said wherever its change is. */
export const JOINED_CHANGE_CAPTION = "vs same days last month"

/**
 * "Joined this month" against the same stretch of last month: on the 5th, the
 * 1st to the 5th of each. Comparing part of a month with all of the last one
 * started every month in the red.
 *
 * The same day means the same date. `signupsByDay` runs from the 1st to today,
 * and a date last month did not have, such as 30 February, counts nobody. So
 * on 30 or 31 March the comparison is all of February and never more.
 */
export function joinedChange(
  summary: Pick<MembershipSummary, "signupsByDay" | "newThisMonth">
) {
  const sameDaysLastMonth = summary.signupsByDay.reduce(
    (sum, day) => sum + day.lastMonth,
    0
  )
  return percentChange(sameDaysLastMonth, summary.newThisMonth)
}

/**
 * The four member-and-money figures the Overview's stat strip opens with.
 *
 * Each is its name, the number and how far it moved, and nothing else. The
 * small facts under a dashed line — the member and admin split, the share of
 * accounts paying, the average each — came off on 25 Sep 2026 at Tyler's ask.
 * The other dashboards that use `StatStrip` keep theirs.
 */
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
    },
    {
      key: "joined",
      to: "/admin/users",
      label: "Joined this month",
      value: summary.newThisMonth.toLocaleString(),
      change: joinedChange(summary),
      changeCaption: JOINED_CHANGE_CAPTION,
      changeNote: "None in the same days last month",
      trend: summary.last30Days.map((day) => day.joined),
    },
    {
      key: "paying",
      // The Plans page, same as the revenue tile below it: who is paying is a
      // question about the plans they are on.
      to: "/admin/plans",
      label: "Paying",
      value: revenue.paidSubscribers.toLocaleString(),
      changeNote: NO_HISTORY,
    },
    {
      key: "revenue",
      to: "/admin/plans",
      label: "Revenue a month",
      value: formatMoney(revenue.monthlyRecurringCents, revenue.currency),
      changeNote: NO_HISTORY,
    },
  ]
}

