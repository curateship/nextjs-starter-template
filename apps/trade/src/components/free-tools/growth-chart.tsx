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

const config = {
  balance: { label: "Balance", color: "var(--foreground)" },
} satisfies ChartConfig

/**
 * The balance over time, drawn the way the P&L graph draws money
 * (`src/components/trade/pnl-graph-widget.tsx`): one foreground line, a faint
 * fill, grid lines across only. The bottom axis counts days, months or years,
 * whichever keeps its labels short.
 */
export function GrowthChart({ points }: { points: GrowthPoint[] }) {
  const lastDay = points.at(-1)?.day ?? 0
  const ticks = [0, 1, 2, 3, 4].map((step) => Math.round((lastDay * step) / 4))

  return (
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
          domain={[0, lastDay]}
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
                {timeLabel(Number(payload.value), lastDay)}
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
                timeLabel(Number(payload?.[0]?.payload?.day ?? 0), lastDay)
              }
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">Balance</span>
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
      </AreaChart>
    </ChartContainer>
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
