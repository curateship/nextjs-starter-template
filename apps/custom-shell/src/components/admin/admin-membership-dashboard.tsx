import * as React from "react"
import { CircleDollarSignIcon, LineChartIcon } from "lucide-react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { ChartCard, LegendDot } from "@/components/shared/chart-card"
import { DashboardPanels } from "@/components/shared/dashboard-panels"
import { MembershipActivityCard } from "@/components/shared/membership-activity-card"
import { NeedsYouCard } from "@/components/shared/needs-you-card"
import { StatStrip } from "@/components/shared/stat-strip"
import {
  ByPlanCard,
  ChargebacksTable,
} from "@/components/admin/admin-membership-blocks"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MembershipPage, MembershipSummary } from "@/lib/api/membership"
import { shade } from "@/lib/chart-colours"
import { buildMembershipFigures } from "@/lib/membership-figures"
import { buildMembershipNeedsYou } from "@/lib/membership-needs-you"

/**
 * The one page for everything about members and money. The Revenue page used to
 * be separate and is folded in here — the two were reading the same tables and
 * both drew revenue by plan, one as a chart and one as a table.
 *
 * Two columns. On the left, the short list of things somebody has to act on and
 * the timeline of what has been happening to people's memberships. On the right,
 * the joining chart leads — it is the one worth a glance on the way past — then
 * the plan card and the chargebacks, which are what cost or make money.
 *
 * Blocks that only repeated a figure already on screen were dropped rather than
 * carried across: revenue per paying person and paying people are both in the
 * stat strip, and people by plan became the second tab of the plan card.
 *
 * Every figure is read from the tables the Users and Plans pages already read,
 * so nothing here can disagree with the page it links to. Where a card would
 * need history the app does not keep, it shows today's picture and says so on
 * the card rather than inventing a trend.
 */

export function AdminMembershipDashboard({
  summary,
}: {
  summary: MembershipPage
}) {
  return (
    <>
      <StatStrip figures={buildMembershipFigures(summary)} />

      {/* The same 55/45 across and 40/30/30 down as the Overview, so moving
          between the two admin pages does not shift the columns under you — and
          the same draggable dividers. On the left the list of things to act on
          sits above the timeline, which is open-ended and so gets the bigger
          share. On the right the chart leads because it is the one worth a
          glance on the way past.

          `DashboardPanels` takes the height the stat strip leaves, so the page
          itself never scrolls and the long blocks scroll inside instead; below
          1280px it drops the dividers and the columns stack. */}
      <DashboardPanels
        page="membership"
        left={[
          {
            id: "needs-you",
            size: 4,
            minSize: "18%",
            render: (className) => (
              <NeedsYouCard
                title="Money and members"
                icon={CircleDollarSignIcon}
                items={buildMembershipNeedsYou(summary)}
                className={className}
              />
            ),
          },
          {
            id: "activity",
            size: 6,
            minSize: "20%",
            render: (className) => (
              <MembershipActivityCard
                items={summary.activity}
                className={className}
              />
            ),
          },
        ]}
        right={[
          {
            id: "joining",
            size: 4,
            minSize: "20%",
            stackedClassName: "shrink-0",
            render: (className) => (
              <JoiningChart summary={summary} className={className} />
            ),
          },
          {
            id: "by-plan",
            size: 3,
            minSize: "18%",
            render: (className) => (
              <ByPlanCard summary={summary} className={className} fillHeight />
            ),
          },
          // Only once there is a history to show — an empty table on a screen
          // nobody has ever had a chargeback on is just noise. Dropping it also
          // takes its divider with it, which is why the remembered layout is
          // keyed on how many blocks the column has.
          ...(summary.disputes.recent.length
            ? [
                {
                  id: "chargebacks",
                  size: 3,
                  minSize: "18%",
                  render: (className: string) => (
                    <ChargebacksTable
                      disputes={summary.disputes.recent}
                      total={summary.disputes.total}
                      className={className}
                      fillHeight
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  )
}

/**
 * Both periods draw the same two lines — what is happening now against the
 * stretch before it — so they share one shape and only the wording changes.
 */
const joiningConfig = (period: "year" | "month"): ChartConfig => ({
  current: {
    label: period === "year" ? "This year" : "This month",
    color: "var(--primary)",
  },
  previous: {
    label: period === "year" ? "Prev year" : "Last month",
    color: shade(70),
  },
})

/**
 * The reference's "Total Revenue" card. This app keeps no revenue history —
 * nothing records what was being paid last March — but it does know when every
 * account was created, so the same chart is drawn from real joining dates.
 */
function JoiningChart({
  summary,
  className,
}: {
  summary: MembershipSummary
  className?: string
}) {
  const [period, setPeriod] = React.useState<"year" | "month">("year")
  const showingYear = period === "year"

  const data = showingYear
    ? summary.signupsByMonth.map((point) => ({
        label: point.month,
        current: point.thisYear,
        previous: point.lastYear,
      }))
    : summary.signupsByDay.map((point) => ({
        label: point.day,
        current: point.thisMonth,
        previous: point.lastMonth,
      }))
  const config = joiningConfig(period)
  const total = data.reduce((sum, point) => sum + point.current, 0)

  return (
    <ChartCard
      icon={LineChartIcon}
      title="People joining"
      className={className}
      // Just "26 joined" — the period picker beside it already says over what,
      // and the longer wording pushed the heading into an ellipsis.
      meta={
        <span className="whitespace-nowrap">
          <span className="font-mono text-base font-semibold tabular-nums text-foreground">
            {total.toLocaleString()}
          </span>{" "}
          joined
        </span>
      }
      legend={
        // The legend is the first thing to go when the header runs out of room:
        // the title and the total both have to survive, and hovering the chart
        // names either line anyway. Below `2xl` this column is too narrow to
        // hold all four without truncating the heading.
        <div className="hidden items-center gap-4 2xl:flex">
          <LegendDot
            colour="var(--primary)"
            label={showingYear ? "This year" : "This month"}
          />
          <LegendDot
            colour={shade(70)}
            label={showingYear ? "Prev year" : "Last month"}
          />
        </div>
      }
      control={
        <Select
          value={period}
          onValueChange={(value) => setPeriod(value as "year" | "month")}
        >
          <SelectTrigger
            className="w-[130px] shrink-0"
            aria-label="Period for people joining"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="year">This year</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {/* The total moved up beside the title. As a block of its own it took
          about 90px off the top of the card — on a card sized to fit the page
          that came straight out of the plot, which is the part worth looking
          at. The card is nearly all chart now. */}
      <div className="h-[200px] w-full min-w-0 sm:h-[240px] lg:h-[280px] xl:h-auto xl:min-h-[120px] xl:flex-1">
        <ChartContainer config={config} className="h-full w-full">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              dy={8}
              // A month of days is too many labels to read; show every third.
              interval={showingYear ? 0 : 2}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, dx: -5 }}
              width={32}
              allowDecimals={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="linear"
              dataKey="previous"
              stroke="var(--color-previous)"
              strokeWidth={1.5}
              strokeOpacity={0.5}
              fill="var(--color-previous)"
              fillOpacity={0.08}
            />
            <Line
              type="linear"
              dataKey="current"
              stroke="var(--color-current)"
              strokeWidth={1.5}
              strokeLinecap="round"
              dot={{ fill: "var(--color-current)", strokeWidth: 0, r: 2 }}
              activeDot={{ r: 3.5 }}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </ChartCard>
  )
}
