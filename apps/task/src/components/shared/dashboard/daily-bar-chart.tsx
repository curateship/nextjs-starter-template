import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { chartHeightClassName } from "@/components/shared/dashboard/chart-card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

/**
 * One bar per day, for an admin page's "over this range" card.
 *
 * Several `bars` stack, bottom first, and only the top one gets rounded
 * corners. Each bar's key is also its key in `config`, which is where its
 * colour and tooltip label come from.
 */
export function DailyBarChart<Point extends { day: string }>({
  daily,
  config,
  bars,
  yAxisWidth,
  fewDaysLabelInterval = 1,
  formatValue,
}: {
  /** One point per day, `day` as YYYY-MM-DD. */
  daily: Point[]
  config: ChartConfig
  bars: { key: string; value: (point: Point) => number }[]
  yAxisWidth: number
  /** How many day labels to skip between two shown, on a range of 20 days or fewer. */
  fewDaysLabelInterval?: number
  /** How a value reads on the axis and in the tooltip. */
  formatValue?: (value: number) => string
}) {
  const data = daily.map((point) => ({
    label: new Date(`${point.day}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }),
    ...Object.fromEntries(bars.map((bar) => [bar.key, bar.value(point)])),
  }))
  const stacked = bars.length > 1

  return (
    <div className={chartHeightClassName}>
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            dy={8}
            // A month of days is too many labels to read; a quarter even more so.
            interval={
              data.length > 45 ? 13 : data.length > 20 ? 5 : fewDaysLabelInterval
            }
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, dx: -5 }}
            width={yAxisWidth}
            allowDecimals={false}
            tickFormatter={formatValue}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={
                  formatValue
                    ? (value) => formatValue(Number(value))
                    : undefined
                }
              />
            }
          />
          {bars.map((bar, index) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              stackId={stacked ? "daily" : undefined}
              fill={`var(--color-${bar.key})`}
              radius={index === bars.length - 1 ? [3, 3, 0, 0] : undefined}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  )
}
