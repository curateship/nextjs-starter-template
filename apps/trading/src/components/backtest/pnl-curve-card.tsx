import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { BacktestEquityPoint } from "@/lib/backtest/types"
import { cn } from "@/lib/utils"

/** Trading polarity pair, consistent with the price + equity charts. */
const CHART_UP = "#089981"
const CHART_DOWN = "#f23645"

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})
const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

/**
 * The value range the y-axis is pinned to: every point plus the starting
 * balance, padded a little so the curve doesn't touch the frame. Always
 * includes the starting balance even when the run never went near it, so the
 * dashed line — and the colour change that sits on it — stays on the chart.
 */
function equityDomain(
  points: BacktestEquityPoint[],
  baseline: number | null
): [number, number] {
  let low = points[0].eq
  let high = points[0].eq
  for (const point of points) {
    if (point.eq < low) low = point.eq
    if (point.eq > high) high = point.eq
  }
  if (baseline !== null) {
    low = Math.min(low, baseline)
    high = Math.max(high, baseline)
  }
  // A perfectly flat curve has no range to pad; give it one so it plots.
  const pad = high > low ? (high - low) * 0.06 : Math.max(1, Math.abs(high) * 0.01)
  return [low - pad, high + pad]
}

/** "Jan 7 – Jul 26" for a curve, or null when there is nothing to plot. */
function curveRangeLabel(points: BacktestEquityPoint[]): string | null {
  if (points.length < 2) return null
  const first = compactDateFormatter.format(points[0].t)
  const last = compactDateFormatter.format(points[points.length - 1].t)
  return `${first} – ${last}`
}

/**
 * The one P&L curve card. A headed equity area chart, green wherever it sits
 * above the starting balance and red wherever it sits below, with a dashed line
 * at that balance — so "was this in profit, and when" is readable at a glance.
 *
 * Shared by the backtest run workspace, the automation editor's backtest rail
 * and the trade journal so all three read identically. Never copy this chart
 * into a page; change it here and every rail moves together.
 */
export function PnlCurveCard({
  points,
  baseline,
  emptyMessage = "Not enough data to plot the P&L curve",
  className,
}: {
  /** Equity over time, already downsampled by whoever loaded it. */
  points: BacktestEquityPoint[]
  /** Where the dashed "started here" line sits; the first point when omitted. */
  baseline?: number | null
  /** What to show instead of the chart when there is too little data. */
  emptyMessage?: string
  className?: string
}) {
  // Recharts resolves gradients by DOM id, so two cards on one page need their
  // own — otherwise the second one paints with the first one's colours.
  const uid = React.useId().replace(/:/g, "")
  const strokeId = `pnl-curve-stroke-${uid}`
  const fillId = `pnl-curve-fill-${uid}`
  const plottable = points.length >= 2
  const rangeLabel = curveRangeLabel(points)
  const line = baseline ?? (plottable ? points[0].eq : null)

  // The curve is green where it is above the starting balance and red where it
  // is below, switching mid-line rather than picking one colour for the whole
  // run — a run that dipped underwater and recovered did both, and the chart
  // should say so. Both gradients change colour at the same height as the
  // dashed starting-balance line, so the axis range has to be pinned rather
  // than left to "auto": the split is placed as a fraction of that range, and
  // an axis that quietly padded itself would slide the colours off the line.
  const domain = plottable
    ? equityDomain(points, line)
    : ([0, 1] as [number, number])
  const split = clamp01((domain[1] - (line ?? domain[0])) / (domain[1] - domain[0]))

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold">P&amp;L curve</span>
        {rangeLabel ? (
          <span className="text-[11px] text-muted-foreground">
            {rangeLabel}
          </span>
        ) : null}
      </div>
      {!plottable ? (
        <div className="flex h-[184px] items-center justify-center rounded-lg border bg-muted/30 px-3 text-center text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <ChartContainer
          config={{ eq: { label: "Equity" } }}
          className="aspect-auto h-[184px] w-full min-w-0"
        >
          <AreaChart
            data={points}
            margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
          >
            <defs>
              {/* Hard colour change exactly at the starting balance. */}
              <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={split} stopColor={CHART_UP} />
                <stop offset={split} stopColor={CHART_DOWN} />
              </linearGradient>
              {/* The same split, faded away from the line in both directions. */}
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={CHART_UP} stopOpacity={0.2} />
                <stop offset={split} stopColor={CHART_UP} stopOpacity={0} />
                <stop offset={split} stopColor={CHART_DOWN} stopOpacity={0} />
                <stop offset={1} stopColor={CHART_DOWN} stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.3} />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(value: number) =>
                compactDateFormatter.format(value)
              }
            />
            <YAxis
              width={54}
              tickLine={false}
              axisLine={false}
              domain={domain}
              tickFormatter={(value: number) =>
                `$${Math.round(value).toLocaleString()}`
              }
            />
            {line !== null ? (
              <ReferenceLine
                y={line}
                strokeDasharray="5 4"
                stroke="currentColor"
                strokeOpacity={0.4}
              />
            ) : null}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0]
                      ? fullDateFormatter.format(
                          payload[0].payload.t as number
                        )
                      : ""
                  }
                />
              }
            />
            <Area
              dataKey="eq"
              type="monotone"
              stroke={`url(#${strokeId})`}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  )
}
