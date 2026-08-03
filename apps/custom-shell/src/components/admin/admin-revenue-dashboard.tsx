import * as React from "react"
import { AlertTriangleIcon, CreditCardIcon, ExternalLinkIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import type {
  DisputeList,
  DisputeRow,
  RevenueSummary,
} from "@/lib/api/admin-users"
import { formatDate } from "@/lib/format-time"
import { formatMoney } from "@/lib/money"
import { pageGutter } from "@/lib/shell-gutter"

type SortColumn = "plan" | "subscribers" | "monthly"

export function AdminRevenueDashboard({
  summary,
  disputes,
}: {
  summary: RevenueSummary
  disputes: DisputeList
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
      {/* Above the figures on purpose: a dispute has a deadline, and the
          revenue numbers will still be there in a week. */}
      {disputes.open.length ? <OpenDisputesCard disputes={disputes.open} /> : null}

      {/* Every block on this page needs `shrink-0`: the page area is a flex
          column, and a block left to shrink loses its last rows off the bottom
          rather than letting the page scroll. */}
      <div
        className="grid shrink-0 md:grid-cols-2 xl:grid-cols-4"
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
        className="shrink-0"
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

      {/* Only once there is a history to show — an empty table on a screen
          nobody has ever had a chargeback on is just noise. */}
      {disputes.recent.length ? (
        <DisputesTable disputes={disputes.recent} total={disputes.total} />
      ) : null}
    </>
  )
}

/**
 * The chargebacks nobody has answered yet.
 *
 * Loud by being first and by naming the deadline in the title, not by shouting
 * in colour — a screen reader and a monochrome display have to get the same
 * warning. It cannot be dismissed, because the only thing that should make it
 * go away is Stripe telling us the dispute is settled.
 */
function OpenDisputesCard({ disputes }: { disputes: DisputeRow[] }) {
  const soonest = disputes.find((dispute) => dispute.evidenceDueBy)

  return (
    // `shrink-0` is not decoration: the page is a flex column and Card clips
    // what it cannot fit, so without this the third chargeback silently
    // disappears off the bottom of the card.
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
          {disputes.length === 1
            ? "1 open chargeback"
            : `${disputes.length} open chargebacks`}
        </CardTitle>
        <CardDescription>
          {soonest?.evidenceDueBy
            ? `A member has asked their bank to take a payment back. Evidence is due to Stripe by ${formatDate(soonest.evidenceDueBy)} — miss it and the money goes automatically.`
            : "A member has asked their bank to take a payment back. Answer it in Stripe before the deadline, or the money goes automatically."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {disputes.map((dispute) => (
          <DisputeLine key={dispute.id} dispute={dispute} />
        ))}
      </CardContent>
    </Card>
  )
}

function DisputeLine({ dispute }: { dispute: DisputeRow }) {
  const overdue = isOverdue(dispute.evidenceDueBy)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/50 px-3 py-2">
      <span className="font-medium tabular-nums">
        {formatMoney(dispute.amountCents, dispute.currency)}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={memberLabel(dispute)}>
        {memberLabel(dispute)}
      </span>
      <Badge variant={overdue ? "destructive" : "outline"}>
        {deadlineLabel(dispute.evidenceDueBy)}
      </Badge>
      <Button asChild variant="outline" size="sm">
        <a href={dispute.stripeUrl} target="_blank" rel="noreferrer noopener">
          <ExternalLinkIcon className="size-4" />
          Answer in Stripe
        </a>
      </Button>
    </div>
  )
}

/**
 * Who the disputed charge belonged to. A charge that could not be matched to an
 * account says so, rather than leaving the space blank and looking broken.
 */
function memberLabel(dispute: DisputeRow) {
  if (dispute.memberName && dispute.memberEmail) {
    return `${dispute.memberName} (${dispute.memberEmail})`
  }
  return "No matching account"
}

function deadlineLabel(evidenceDueBy: string | null) {
  if (!evidenceDueBy) return "No deadline yet"
  return isOverdue(evidenceDueBy)
    ? `Overdue — was ${formatDate(evidenceDueBy)}`
    : `Due ${formatDate(evidenceDueBy)}`
}

function isOverdue(evidenceDueBy: string | null) {
  return Boolean(evidenceDueBy && new Date(evidenceDueBy) < new Date())
}

/** Every dispute this app has seen, settled ones included. */
function DisputesTable({
  disputes,
  total,
}: {
  disputes: DisputeRow[]
  total: number
}) {
  return (
    <DashboardTable
      title="Chargebacks"
      icon={<AlertTriangleIcon />}
      className="shrink-0"
      count={total}
      header={
        <TableHeader>
          <TableRow>
            <TableHead column="main">Member</TableHead>
            <TableHead column="meta">Amount</TableHead>
            <TableHead column="meta">Reason</TableHead>
            <TableHead column="meta">Outcome</TableHead>
            <TableHead column="meta">Opened</TableHead>
            <TableHead column="meta" className="text-right">
              Stripe
            </TableHead>
          </TableRow>
        </TableHeader>
      }
      isEmpty={disputes.length === 0}
      emptyText="No chargebacks. Nobody has disputed a payment."
      emptyColSpan={6}
      // The list is capped, so the footer counts every chargeback rather than
      // the rows on screen — otherwise a long history would quietly read as
      // being shorter than it is.
      footer={{
        type: "summary",
        count: total,
        label: total === 1 ? "chargeback" : "chargebacks",
      }}
    >
      {disputes.map((dispute) => (
        <TableRow key={dispute.id}>
          <TableCell column="main">
            <span
              className="block max-w-96 truncate"
              title={memberLabel(dispute)}
            >
              {memberLabel(dispute)}
            </span>
          </TableCell>
          <TableCell column="meta" className="tabular-nums">
            {formatMoney(dispute.amountCents, dispute.currency)}
          </TableCell>
          <TableCell column="mutedMeta">
            <span className="block max-w-40 truncate" title={dispute.reason}>
              {dispute.reason}
            </span>
          </TableCell>
          <TableCell column="meta">
            <Badge variant={outcomeVariant(dispute)}>
              {dispute.statusLabel}
            </Badge>
          </TableCell>
          <TableCell column="mutedMeta">{formatDate(dispute.openedAt)}</TableCell>
          <TableCell column="meta" className="text-right">
            <a
              className="font-medium underline-offset-4 hover:underline"
              href={dispute.stripeUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              View
            </a>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

function outcomeVariant(dispute: DisputeRow) {
  if (dispute.open) return "outline" as const
  return dispute.status === "won" ? ("secondary" as const) : ("destructive" as const)
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
