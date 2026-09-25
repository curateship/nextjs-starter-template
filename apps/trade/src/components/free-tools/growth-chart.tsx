import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  DAYS_IN_MONTH,
  DAYS_IN_YEAR,
  type GrowthPoint,
} from "@/lib/free-tools/compound-growth"
import { formatAxisMoney, formatToolMoney } from "@/lib/free-tools/money"

type ChartPoint = { day: number; balance: number; putIn?: number }

/**
 * Money over time for the free tools, drawn the way the P&L graph draws
 * money (`src/components/trade/pnl-graph-widget.tsx`): one foreground line, a
 * faint fill, grid lines across only.
 *
 * By default the bottom axis counts days, months or years from day 0,
 * whichever keeps its labels short. A tool whose days are dates passes
 * `dayLabel`. Points that carry `putIn` add a dashed line for the money put
 * in so far, named in a legend under the chart.
 */
export function GrowthChart({
  points,
  valueLabel = "Balance",
  dayLabel,
}: {
  points: readonly (GrowthPoint | ChartPoint)[]
  valueLabel?: string
  dayLabel?: (day: number) => string
}) {
  const firstDay = points[0]?.day ?? 0
  const lastDay = points.at(-1)?.day ?? 0
  const ticks = [0, 1, 2, 3, 4].map((step) =>
    Math.round(firstDay + ((lastDay - firstDay) * step) / 4)
  )
  const label = dayLabel ?? ((day: number) => timeLabel(day, lastDay))
  const showPutIn = points.some((point) => "putIn" in point)
  const config = {
    balance: { label: valueLabel, color: "var(--foreground)" },
    putIn: { label: "Put in", color: "var(--muted-foreground)" },
  } satisfies ChartConfig

  const chart = (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart
        data={points}
        margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="growth-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-balance)"
              stopOpacity={0.08}
            />
            <stop
              offset="100%"
              stopColor="var(--color-balance)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[firstDay, lastDay]}
          ticks={ticks}
          tick={({ x, y, index, payload, width }) =>
            // A narrow chart keeps the first, middle and last labels so
            // neighbouring ones never touch.
            Number(width) < 480 && index % 2 === 1 ? (
              <g />
            ) : (
              // The first and last labels sit flush with the line's ends
              // instead of hanging off the card's edges.
              <text
                x={x}
                y={y}
                dy={12}
                className="fill-muted-foreground text-xs"
                textAnchor={
                  index === 0
                    ? "start"
                    : index === ticks.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {label(Number(payload.value))}
              </text>
            )
          }
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          tickFormatter={(value) => formatAxisMoney(Number(value))}
          tickLine={false}
          axisLine={false}
          width={64}
          className="font-mono text-xs"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                label(Number(payload?.[0]?.payload?.day ?? 0))
              }
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {name === "putIn" ? "Put in" : valueLabel}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatToolMoney(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          type="linear"
          dataKey="balance"
          isAnimationActive={false}
          stroke="var(--color-balance)"
          strokeWidth={1.75}
          fill="url(#growth-chart-fill)"
          activeDot={{
            r: 4,
            fill: "var(--color-balance)",
            stroke: "var(--background)",
            strokeWidth: 2,
          }}
        />
        {showPutIn ? (
          <Area
            type="stepAfter"
            dataKey="putIn"
            isAnimationActive={false}
            stroke="var(--color-putIn)"
            strokeWidth={1.25}
            strokeDasharray="4 4"
            fill="none"
            activeDot={false}
          />
        ) : null}
      </AreaChart>
    </ChartContainer>
  )
  if (!showPutIn) return chart
  return (
    <div className="grid gap-2">
      {chart}
      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="w-4 border-t-2 border-foreground" />
          {valueLabel}
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-4 border-t-2 border-dashed border-muted-foreground"
          />
          Put in
        </li>
      </ul>
    </div>
  )
}

/** "Day 45" for a stretch under two months, "Month 6" under three years, else "Year 4". */
function timeLabel(day: number, lastDay: number): string {
  if (day === 0) return "Start"
  if (lastDay < 2 * DAYS_IN_MONTH) return `Day ${day}`
  if (lastDay < 3 * DAYS_IN_YEAR) {
    return `Month ${Math.round(day / DAYS_IN_MONTH)}`
  }
  return `Year ${Math.round((day / DAYS_IN_YEAR) * 10) / 10}`
}
