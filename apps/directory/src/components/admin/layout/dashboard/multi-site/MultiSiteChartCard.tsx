"use client"

import { useEffect, useMemo, useState } from "react"
import DollarSign from "lucide-react/dist/esm/icons/dollar-sign.js"
import Eye from "lucide-react/dist/esm/icons/eye.js"
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js"
import Users from "lucide-react/dist/esm/icons/users.js"
import { Area, AreaChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import { Card } from "@/components/ui/card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import type { DashboardRange, MultiSiteDashboardData } from "@/lib/actions/analytics/analytics-actions"

// The 1b design's chart card: the four metric stats fold into the top of the chart
// card as clickable cells (active cell = underline) that drive the chart metric,
// with the range tabs living in the chart header. Chart internals mirror ChartGroup7.

type DashboardMetric = "visitors" | "contacts" | "orders" | "revenue"

const metricOptions: Array<{ metric: DashboardMetric; label: string; icon: typeof Eye }> = [
  { metric: "visitors", label: "Visitors", icon: Eye },
  { metric: "contacts", label: "Contacts", icon: Users },
  { metric: "orders", label: "Orders", icon: ShoppingCart },
  { metric: "revenue", label: "Revenue", icon: DollarSign },
]

const metricLabels: Record<DashboardMetric, string> = {
  visitors: "Visitors",
  contacts: "Contacts",
  orders: "Orders",
  revenue: "Revenue",
}

const chartConfig = {
  visitors: { label: "Visitors", color: "var(--chart-1)" },
  contacts: { label: "Contacts", color: "var(--chart-2)" },
  orders: { label: "Orders", color: "var(--chart-3)" },
  revenue: { label: "Revenue", color: "var(--chart-4)" },
} satisfies ChartConfig

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

const fallbackPoint = {
  label: "No data",
  pageViews: 0,
  visitors: 0,
  contacts: 0,
  orders: 0,
  revenue: 0,
}

interface MultiSiteChartCardProps {
  metrics: MultiSiteDashboardData
  rangeControl: React.ReactNode
}

export function MultiSiteChartCard({ metrics, rangeControl }: MultiSiteChartCardProps) {
  const [activeMetric, setActiveMetric] = useState<DashboardMetric>("visitors")
  const [isMobile, setIsMobile] = useState(false)
  const displayData = metrics.chartData.length > 0 ? metrics.chartData : [fallbackPoint]
  const chartDisplayData = isMobile ? displayData.slice(-7) : displayData
  const chartDescription = metrics.range === "365d"
    ? "Combined across all sites · monthly totals, last 365 days"
    : `Combined across all sites · daily totals, last ${isMobile ? 7 : 30} days`

  const stats = useMemo(
    () =>
      metricOptions.map((option) => ({
        ...option,
        value: metrics.totals[option.metric],
        change: getPercentChange(metrics.totals[option.metric], metrics.previousTotals[option.metric]),
      })),
    [metrics.totals, metrics.previousTotals]
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)")
    const updateIsMobile = () => setIsMobile(mediaQuery.matches)

    updateIsMobile()
    mediaQuery.addEventListener("change", updateIsMobile)

    return () => mediaQuery.removeEventListener("change", updateIsMobile)
  }, [])

  return (
    <Card className="min-w-0 overflow-hidden rounded-xl">
      <div className="grid grid-cols-2 border-b lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <button
              key={stat.metric}
              type="button"
              data-active={activeMetric === stat.metric}
              onClick={() => setActiveMetric(stat.metric)}
              className="flex flex-col gap-2 border-b-2 border-b-transparent px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[active=true]:border-b-foreground data-[active=true]:bg-muted/50 sm:px-5 [&:nth-child(odd)]:border-r lg:[&:nth-child(2)]:border-r max-lg:[&:nth-child(-n+2)]:shadow-[inset_0_-1px_0_var(--border)]"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{stat.label}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight">
                  {formatMetricValue(stat.metric, stat.value)}
                </span>
                <span className={`text-xs font-semibold ${stat.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {stat.change >= 0 ? "+" : ""}
                  {stat.change.toFixed(1)}%
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-4 sm:px-5">
        <div className="space-y-0.5">
          <h3 className="font-semibold leading-none tracking-tight">
            {metricLabels[activeMetric]} over time
          </h3>
          <p className="text-sm text-muted-foreground">{chartDescription}</p>
        </div>
        {rangeControl}
      </div>
      <div className="min-w-0 px-2 pb-4 sm:px-3">
        <ChartContainer config={chartConfig} className="h-[360px] min-w-0 w-full">
          <AreaChart accessibilityLayer data={chartDisplayData} margin={{ top: 44, right: 16, left: 0, bottom: 16 }}>
            <defs>
              <linearGradient id="multiSiteMetricGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={8} fontSize={12} />
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
                            <div className="h-2.5 w-1 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
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
                        <div className="h-2.5 w-1 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                          <span className="text-muted-foreground">
                            {chartConfig[name as DashboardMetric]?.label ?? metricLabels[activeMetric]}
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
            <Area
              type="natural"
              dataKey={activeMetric}
              name={activeMetric}
              stroke="var(--foreground)"
              strokeWidth={2}
              fill="url(#multiSiteMetricGradient)"
              fillOpacity={1}
              isAnimationActive={false}
              dot={{ fill: "var(--foreground)" }}
              activeDot={{ r: 6 }}
            >
              <LabelList
                position="top"
                offset={12}
                className="fill-foreground"
                fontSize={12}
                formatter={(value) => formatAxisValue(activeMetric, Number(value ?? 0))}
              />
            </Area>
          </AreaChart>
        </ChartContainer>
      </div>
    </Card>
  )
}
