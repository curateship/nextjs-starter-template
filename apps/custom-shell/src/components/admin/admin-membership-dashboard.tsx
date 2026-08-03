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
import { pageGutter } from "@/lib/shell-gutter"

/**
 * The one page for everything about members and money. The Revenue page used to
 * be separate and is folded in here — the two were reading the same tables and
 * both drew revenue by plan, one as a chart and one as a table.
 *
 * Two columns. On the left, the short list of things somebody has to act on and
 * the timeline of what has been happening to people's memberships. On the right,
 * the numbers, money nearest the top — the plan card and the chargebacks are
 * what cost or make money, so they come before the joining chart.
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
  const gutter = { gap: pageGutter }

  return (
    <>
      <StatStrip figures={buildMembershipFigures(summary)} />

      {/* Proportions rather than pinned widths, so the split holds at every
          wide size. The right column is the wider one because it carries the
          tables.

          From `xl` up the grid takes the height the stat strip leaves and the
          two columns share it, so the page itself never scrolls — the long
          blocks inside scroll instead. That is measured by the browser rather
          than guessed at in `vh`, which is the only way it can survive a resize:
          a `vh` figure knows nothing about the strip, the gutters or the header
          above it. Below `xl` the columns stack into one and the page goes back
          to scrolling, which is the right answer on a narrow screen.

          Every block still needs `shrink-0` so the ones meant to keep their
          natural height do; the two that fill say so themselves. */}
      <div
        className="grid shrink-0 items-start xl:min-h-0 xl:shrink xl:basis-0 xl:grow xl:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] xl:items-stretch"
        style={gutter}
      >
        <div className="flex min-w-0 flex-col xl:min-h-0" style={gutter}>
          <NeedsYouCard
            title="Money and members"
            icon={CircleDollarSignIcon}
            items={buildMembershipNeedsYou(summary)}
          />
          {/* The timeline is open-ended, so it is the one that gives — down to
              a floor, below which the page scrolls instead. */}
          <MembershipActivityCard
            items={summary.activity}
            className="xl:min-h-56 xl:flex-1"
          />
        </div>

        <div className="flex min-w-0 flex-col xl:min-h-0" style={gutter}>
          <ByPlanCard summary={summary} />

          {/* Only once there is a history to show — an empty table on a screen
              nobody has ever had a chargeback on is just noise. The id is what
              the "open chargebacks" row on the left jumps to. */}
          {summary.disputes.recent.length ? (
            <ChargebacksTable
              disputes={summary.disputes.recent}
              total={summary.disputes.total}
              // A floor that still leaves room for rows. The toolbar and the
              // footer eat about 100px of it, so anything less than this is a
              // heading and a total with a sliver of table between them.
              className="xl:min-h-60 xl:flex-1"
              fillHeight
            />
          ) : null}

          <JoiningChart summary={summary} />
        </div>
      </div>
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
function JoiningChart({ summary }: { summary: MembershipSummary }) {
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
      className="shrink-0 xl:min-h-56 xl:shrink xl:basis-0 xl:grow"
      legend={
        <div className="hidden items-center gap-4 lg:flex">
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
      <div>
        <p className="font-mono text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {total.toLocaleString()}
        </p>
        <p className="text-[10px] tracking-wider text-muted-foreground uppercase sm:text-xs">
          {showingYear
            ? "joined in the last 12 months"
            : "joined so far this month"}
        </p>
      </div>
      {/* From `xl` the plot gives up its fixed height and takes what the column
          has left, down to a floor it stops shrinking at — a chart squeezed
          past that is unreadable, and the column is better off scrolling. */}
      <div className="h-[200px] w-full min-w-0 sm:h-[240px] lg:h-[280px] xl:h-auto xl:min-h-[150px] xl:flex-1">
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
