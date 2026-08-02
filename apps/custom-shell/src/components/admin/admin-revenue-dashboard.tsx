import * as React from "react"
import { CreditCardIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import type { RevenueSummary } from "@/lib/api/admin-users"
import { formatMoney } from "@/lib/money"
import { pageGutter } from "@/lib/shell-gutter"

type SortColumn = "plan" | "subscribers" | "monthly"

export function AdminRevenueDashboard({
  summary,
}: {
  summary: RevenueSummary
}) {
  // Biggest earner first, which is the order the server already sends.
  const [sort, setSort] = React.useState<SortColumn>("monthly")
  const [direction, setDirection] = React.useState<TableSortDirection>("desc")

  const toggleSort = (column: SortColumn) => {
    if (column === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection("asc")
  }

  const sortedPlans = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...summary.planBreakdown].sort((left, right) => {
      if (sort === "plan") {
        return factor * left.planName.localeCompare(right.planName)
      }
      if (sort === "subscribers") {
        return factor * (left.subscribers - right.subscribers)
      }
      return factor * (left.monthlyCents - right.monthlyCents)
    })
  }, [direction, sort, summary.planBreakdown])

  const planCount = summary.planBreakdown.length

  return (
    <>
      <div
        className="grid md:grid-cols-2 xl:grid-cols-4"
        style={{ gap: pageGutter }}
      >
        <StatCard
          label="Monthly recurring revenue"
          value={formatMoney(summary.monthlyRecurringCents, summary.currency)}
          help="Yearly plans counted as a twelfth of their price."
        />
        <StatCard
          label="Paying subscribers"
          value={summary.paidSubscribers.toLocaleString()}
          help={`${summary.trialing.toLocaleString()} on a trial`}
        />
        <StatCard
          label="Cancelling"
          value={summary.cancelling.toLocaleString()}
          help="Still paid until their period ends."
        />
        <StatCard
          label="Accounts"
          value={summary.totalUsers.toLocaleString()}
          help={`${summary.verifiedUsers.toLocaleString()} verified`}
        />
      </div>

      <DashboardTable
        title="Revenue by plan"
        icon={<CreditCardIcon />}
        count={planCount}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "plan"}
                  direction={direction}
                  onClick={() => toggleSort("plan")}
                >
                  Plan
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "subscribers"}
                  direction={direction}
                  onClick={() => toggleSort("subscribers")}
                >
                  Subscribers
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "monthly"}
                  direction={direction}
                  onClick={() => toggleSort("monthly")}
                >
                  Monthly
                </TableSortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={planCount === 0}
        emptyText="No paid subscriptions yet."
        emptyColSpan={3}
        // The footer count carries what the old card description said: a plan is
        // only listed while somebody is actually subscribed to it right now.
        footer={{
          type: "summary",
          count: planCount,
          label:
            planCount === 1
              ? "plan with a live subscriber"
              : "plans with live subscribers",
        }}
      >
        {sortedPlans.map((row) => (
          <TableRow key={row.planId}>
            <TableCell column="main">
              <span
                className="block max-w-96 truncate font-medium"
                title={row.planName}
              >
                {row.planName}
              </span>
            </TableCell>
            <TableCell column="meta">
              {row.subscribers.toLocaleString()}
            </TableCell>
            <TableCell column="meta">
              {formatMoney(row.monthlyCents, summary.currency)}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </>
  )
}

function StatCard({
  label,
  value,
  help,
}: {
  label: string
  value: string
  help?: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {/* Same variant as the size=sm title default so it overrides, not loses to, that rule. */}
        <CardTitle className="group-data-[size=sm]/card:text-2xl">{value}</CardTitle>
      </CardHeader>
      {help ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{help}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}
