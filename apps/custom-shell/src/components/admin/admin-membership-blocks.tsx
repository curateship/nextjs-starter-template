import * as React from "react"
import { AlertTriangleIcon, CreditCardIcon } from "lucide-react"
import { Cell, Pie, PieChart } from "recharts"

import { EmptyChart } from "@/components/shared/chart-card"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import type { DisputeRow, RevenueSummary } from "@/lib/api/admin-users"
import type { MembershipSummary } from "@/lib/api/membership"
import { seriesColour } from "@/lib/chart-colours"
import { formatDate } from "@/lib/format-time"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * The plan card and the chargebacks table. They were the Revenue page until it
 * was folded into Membership; they live in their own file so the Membership
 * dashboard is still one screen of layout rather than one screen of table
 * markup.
 *
 * The old page also carried a loud "open chargebacks" card above its figures.
 * That warning is now a row on the Membership page's "Money and members" card,
 * which is where every other thing needing somebody is listed — and the row
 * jumps down to the table below, so nothing is said twice.
 */

type SortColumn = "plan" | "subscribers" | "monthly"

/**
 * One card, two ways of reading the same plans: what each brings in a month,
 * and how the people are split across them.
 *
 * Tabs rather than two cards, because it is one question — how do the plans
 * compare? — asked in money and then in people. Money opens, being the more
 * expensive answer to have wrong.
 *
 * Everything is on the one `DashboardTable`, tab state and sorting included. A
 * second one nested inside the first would draw its card chrome twice, which is
 * why the people tab is passed as `content` rather than as its own card.
 */
export function ByPlanCard({ summary }: { summary: MembershipSummary }) {
  const [tab, setTab] = React.useState<"revenue" | "people">("revenue")
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
    return [...summary.revenue.planBreakdown].sort((left, right) => {
      if (sort === "plan") {
        return factor * left.planName.localeCompare(right.planName)
      }
      if (sort === "subscribers") {
        return factor * (left.subscribers - right.subscribers)
      }
      return factor * (left.monthlyCents - right.monthlyCents)
    })
  }, [direction, sort, summary.revenue.planBreakdown])

  const peoplePlans = summary.planMembership.filter((plan) => plan.people > 0)
  const planCount = summary.revenue.planBreakdown.length
  const showingPeople = tab === "people"

  const controls = (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <TabsList className="h-8 p-[3px]">
        <TabsTrigger value="revenue">Revenue</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  if (showingPeople) {
    return (
      <DashboardTable
        title="By plan"
        icon={<CreditCardIcon />}
        className="shrink-0"
        count={peoplePlans.length}
        controls={controls}
        content={<PeopleByPlan plans={peoplePlans} />}
        // Unlike the revenue tab this counts the free plan too, so the slices
        // add up to every account in the app.
        footer={{
          type: "summary",
          count: peoplePlans.length,
          label:
            peoplePlans.length === 1
              ? "plan with anybody on it"
              : "plans with anybody on them",
        }}
      />
    )
  }

  return (
    <DashboardTable
      title="By plan"
      icon={<CreditCardIcon />}
      className="shrink-0"
      count={planCount}
      controls={controls}
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
          <TableCell column="meta">{row.subscribers.toLocaleString()}</TableCell>
          <TableCell column="meta">
            {formatMoney(row.monthlyCents, summary.revenue.currency)}
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

/** Everybody in the app, split by the plan they are on. */
function PeopleByPlan({
  plans,
}: {
  plans: MembershipSummary["planMembership"]
}) {
  const [activeSlice, setActiveSlice] = React.useState<number | null>(null)

  const slices = plans.map((plan, index) => ({
    name: plan.planName,
    people: plan.people,
    colour: seriesColour(index),
  }))
  const everyone = slices.reduce((sum, slice) => sum + slice.people, 0)
  const biggest = slices.reduce(
    (top, slice) => (slice.people > top.people ? slice : top),
    slices[0] ?? { name: "", people: 0, colour: "" }
  )
  const config: ChartConfig = { people: { label: "People" } }

  if (!slices.length) {
    return (
      <div className="px-6 py-8">
        <EmptyChart message="No accounts yet." />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 px-6 py-6">
      <div className="relative size-[170px] shrink-0">
        <ChartContainer config={config} className="h-full w-full">
          <PieChart>
            <Pie
              data={slices}
              dataKey="people"
              nameKey="name"
              innerRadius="52%"
              outerRadius="80%"
              // A gap between slices needs two slices; on one it just notches
              // the ring.
              paddingAngle={slices.length > 1 ? 3 : 0}
              strokeWidth={0}
              onMouseEnter={(_, index: number) => setActiveSlice(index)}
              onMouseLeave={() => setActiveSlice(null)}
            >
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.colour} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-semibold tabular-nums">
            {everyone ? Math.round((biggest.people / everyone) * 100) : 0}%
          </span>
          <span className="text-[9px] text-muted-foreground">
            {biggest.name}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        {slices.map((slice, index) => (
          <div
            key={slice.name}
            className={cn(
              "flex items-center gap-2.5 transition-opacity",
              activeSlice !== null && activeSlice !== index && "opacity-50"
            )}
            onMouseEnter={() => setActiveSlice(index)}
            onMouseLeave={() => setActiveSlice(null)}
          >
            <span
              className="h-4 w-1 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.colour }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {slice.name}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {slice.people.toLocaleString()}
            </span>
            <span className="w-9 text-right text-xs font-semibold tabular-nums">
              {everyone ? Math.round((slice.people / everyone) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Every dispute this app has seen, settled ones included. */
export function ChargebacksTable({
  disputes,
  total,
  className,
  fillHeight = false,
}: {
  disputes: DisputeRow[]
  total: number
  className?: string
  /** Take the height the column has left over rather than growing to fit. */
  fillHeight?: boolean
}) {
  return (
    // The id is what the "open chargebacks" row on the Money and members card
    // jumps to, so pressing Answer lands on the table rather than the top of a
    // page the reader has to search.
    <div
      id="chargebacks"
      className={cn(
        "min-w-0 scroll-mt-6",
        // `shrink-0` and a flex child that is meant to give are opposites, so
        // it is one or the other rather than both fighting over source order.
        fillHeight ? "flex min-h-0 flex-col" : "shrink-0",
        className
      )}
    >
      <DashboardTable
        title="Chargebacks"
        icon={<AlertTriangleIcon />}
        count={total}
        // This table shares its column with the plan card and the joining
        // chart, so it takes the height they leave and scrolls a long dispute
        // history inside itself rather than pushing them off the bottom.
        fillHeight={fillHeight}
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
            <TableCell column="mutedMeta">
              {formatDate(dispute.openedAt)}
            </TableCell>
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

function outcomeVariant(dispute: DisputeRow) {
  if (dispute.open) return "outline" as const
  return dispute.status === "won"
    ? ("secondary" as const)
    : ("destructive" as const)
}
