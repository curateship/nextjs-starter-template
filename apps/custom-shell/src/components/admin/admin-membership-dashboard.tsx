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
  const gutter = { gap: pageGutter }

  return (
    <>
      <StatStrip figures={buildMembershipFigures(summary)} />

      {/* Proportions rather than pinned widths, so the split holds at every
          wide size. The same 11/9 as the Overview, so moving between the two
          admin pages does not shift the columns under you.

          From `xl` up the grid takes the height the stat strip leaves and the
          two columns share it, so the page itself never scrolls — the long
          blocks inside scroll instead. That is measured by the browser rather
          than guessed at in `vh`, which is the only way it can survive a resize:
          a `vh` figure knows nothing about the strip, the gutters or the header
          above it. Below `xl` the columns stack into one and the page goes back
          to scrolling, which is the right answer on a narrow screen.

          `shrink-0` is the narrow-screen behaviour; from `xl` each block says
          for itself what share of the column it takes. */}
      <div
        className="grid shrink-0 items-start xl:min-h-0 xl:shrink xl:basis-0 xl:grow xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] xl:items-stretch"
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
          {/* The three blocks split the column 40 / 30 / 30, so it is full at
              any window height without a single pinned number: `basis-0` makes
              each one's share its grow figure, 4 against 3 against 3. The chart
              leads and gets the biggest share because it is the one worth a
              glance on the way past. Each keeps a floor, and below that the
              page scrolls rather than squeezing them into nothing. */}
          <JoiningChart summary={summary} />
          <ByPlanCard
            summary={summary}
            className="xl:min-h-52 xl:shrink xl:basis-0 xl:grow-[3]"
            fillHeight
          />

          {/* Only once there is a history to show — an empty table on a screen
              nobody has ever had a chargeback on is just noise. The id is what
              the "open chargebacks" row on the left jumps to. */}
          {summary.disputes.recent.length ? (
            <ChargebacksTable
              disputes={summary.disputes.recent}
              total={summary.disputes.total}
              className="xl:min-h-52 xl:shrink xl:basis-0 xl:grow-[3]"
              fillHeight
            />
          ) : null}
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
      className="shrink-0 xl:min-h-56 xl:shrink xl:basis-0 xl:grow-[4]"
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
