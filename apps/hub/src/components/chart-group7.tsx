"use client"

import { useMemo, useState } from "react"
import { DollarSign, Eye, ShoppingCart, TrendingDown, TrendingUp, Users } from "lucide-react"
import { CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type DashboardMetric = "visitors" | "contacts" | "orders" | "revenue"
type DashboardRange = "today" | "yesterday" | "7d" | "30d" | "365d"

interface DashboardTotals {
  visitors: number
  contacts: number
  orders: number
  revenue: number
}

interface DashboardChartPoint extends DashboardTotals {
  label: string
  pageViews: number
}

interface ChartGroup7Props {
  cardRange: DashboardRange
  chartData: DashboardChartPoint[]
  chartRange: DashboardRange
  className?: string
  previousTotals: DashboardTotals
  totals: DashboardTotals
}

const metricOptions: Array<{
  metric: DashboardMetric
  label: string
  icon: typeof Eye
}> = [
  { metric: "visitors", label: "Visitors", icon: Eye },
  { metric: "contacts", label: "Contacts", icon: Users },
  { metric: "orders", label: "Orders", icon: ShoppingCart },
  { metric: "revenue", label: "Revenue", icon: DollarSign },
]

const chartConfig = {
  visitors: { label: "Visitors", color: "var(--chart-1)" },
  contacts: { label: "Contacts", color: "var(--chart-2)" },
  orders: { label: "Orders", color: "var(--chart-3)" },
  revenue: { label: "Revenue", color: "var(--chart-4)" },
} satisfies ChartConfig

const rangeLabels: Record<DashboardRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "365d": "Last 365 days",
}

const rangeDescriptions: Record<DashboardRange, string> = {
  today: "One-day totals for today",
  yesterday: "One-day totals for yesterday",
  "7d": "Daily totals for the last 7 days",
  "30d": "Daily totals for the last 30 days",
  "365d": "Monthly totals for the last 365 days",
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

function formatMetricValue(metric: DashboardMetric, value: number) {
  if (metric === "revenue") return currencyFormatter.format(value)
  return Math.round(value).toLocaleString()
}

function formatAxisValue(metric: DashboardMetric, value: number) {
  if (metric === "revenue") return compactCurrencyFormatter.format(value)
  return compactNumberFormatter.format(value)
}

function getPercentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

const fallbackPoint: DashboardChartPoint = {
  label: "No data",
  pageViews: 0,
  visitors: 0,
  contacts: 0,
  orders: 0,
  revenue: 0,
}

const ChartGroup7 = ({
  cardRange,
  chartData,
  chartRange,
  className,
  previousTotals,
  totals,
}: ChartGroup7Props) => {
  const [activeMetric, setActiveMetric] = useState<DashboardMetric>("visitors")
  const activeOption = metricOptions.find((option) => option.metric === activeMetric) ?? metricOptions[0]
  const displayData = chartData.length > 0 ? chartData : [fallbackPoint]
  const stats = useMemo(
    () =>
      metricOptions.map((option) => ({
        ...option,
        value: totals[option.metric],
        change: getPercentChange(totals[option.metric], previousTotals[option.metric]),
      })),
    [previousTotals, totals]
  )

  return (
    <section className={className}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon

          return (
            <Card key={stat.metric}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {stat.change >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={stat.change >= 0 ? "text-green-600" : "text-red-600"}>
                    {stat.change >= 0 ? "+" : ""}
                    {stat.change.toFixed(1)}%
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-normal">
                  {formatMetricValue(stat.metric, stat.value)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{rangeLabels[cardRange]} vs previous period</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{activeOption.label}</CardTitle>
            <CardDescription>{rangeDescriptions[chartRange]}</CardDescription>
          </div>
          <Tabs value={activeMetric} onValueChange={(value) => setActiveMetric(value as DashboardMetric)}>
            <TabsList className="h-9 max-w-full justify-start overflow-x-auto">
              {metricOptions.map((option) => (
                <TabsTrigger key={option.metric} value={option.metric} className="h-7 px-2.5 text-xs">
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[360px] w-full">
            <LineChart
              accessibilityLayer
              data={displayData}
              margin={{ top: 44, right: 16, left: 0, bottom: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                fontSize={12}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                fontSize={12}
                width={activeMetric === "revenue" ? 58 : 42}
                tickFormatter={(value) => formatAxisValue(activeMetric, Number(value))}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                    formatter={(value, name, item) => {
                      if (activeMetric === "visitors") {
                        return (
                          <div className="grid min-w-40 gap-1.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-1 shrink-0 rounded-sm"
                                style={{ backgroundColor: item.color }}
                              />
                              <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                                <span className="text-muted-foreground">Visitors</span>
                                <span className="font-mono font-medium tabular-nums text-foreground">
                                  {formatMetricValue("visitors", Number(value))}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-4 pl-3 leading-none">
                              <span className="text-muted-foreground">Page Views</span>
                              <span className="font-mono font-medium tabular-nums text-foreground">
                                {Number(item.payload.pageViews ?? 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div className="flex min-w-36 items-center gap-2">
                          <div
                            className="h-2.5 w-1 shrink-0 rounded-sm"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">
                              {chartConfig[name as DashboardMetric]?.label ?? activeOption.label}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatMetricValue(activeMetric, Number(value))}
                            </span>
                          </div>
                        </div>
                      )
                    }}
                  />
                }
              />
              <Line
                type="natural"
                dataKey={activeMetric}
                name={activeMetric}
                stroke={`var(--color-${activeMetric})`}
                strokeWidth={2}
                dot={{ fill: `var(--color-${activeMetric})` }}
                activeDot={{ r: 6 }}
              >
                <LabelList
                  position="top"
                  offset={12}
                  className="fill-foreground"
                  fontSize={12}
                  formatter={(value) => formatAxisValue(activeMetric, Number(value ?? 0))}
                />
              </Line>
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </section>
  )
}

export { ChartGroup7 }
