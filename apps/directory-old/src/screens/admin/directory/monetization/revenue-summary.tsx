"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import BadgeDollarSign from "lucide-react/dist/esm/icons/badge-dollar-sign.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import Star from "lucide-react/dist/esm/icons/star.js"
import { Area, AreaChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  getDirectoryFeaturedRevenueSummaryAction,
  type DirectoryFeaturedRevenueSummary,
} from "@/lib/actions/directories/directory-monetization-actions"
import { formatCentsAmount } from "@/lib/actions/directories/directory-featured-helpers"
import { EXPIRING_SOON_DAYS } from "@/lib/actions/directories/directory-revenue-summary"
import { formatShortDate } from "@/components/admin/layout/list"
import { Card, CardContent, CardDescription, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { AdminLoading } from "@/components/admin/layout/loading"
import { ErrorBanner } from "@/components/ui/error-banner"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const chartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-4)" },
} satisfies ChartConfig

const DAY_MS = 24 * 60 * 60 * 1000

const emptySummary: DirectoryFeaturedRevenueSummary = {
  currencies: [],
  activeCount: 0,
  expiringCount: 0,
  expiringSoon: [],
  error: null,
}

const fallbackChartPoint = { label: "No data", revenue: 0, purchases: 0 }

function buildRevenueFormatters(currency: string) {
  const currencyCode = currency.toUpperCase()
  try {
    return {
      full: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
      compact: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        notation: "compact",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
    }
  } catch {
    return {
      full: { format: (value: number) => `${value.toFixed(2)} ${currencyCode}` },
      compact: { format: (value: number) => `${Math.round(value)} ${currencyCode}` },
    }
  }
}

function daysLeftLabel(endsAt: string) {
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY_MS)
  if (days <= 0) return "expires today"
  return days === 1 ? "1 day left" : `${days} days left`
}

function StatCard({ icon: Icon, label, value, caption }: {
  icon: typeof Star
  label: string
  value: string
  caption: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-normal">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  )
}

export function MonetizationRevenueSummary({ siteId, siteLoading }: {
  siteId: string | null
  siteLoading: boolean
}) {
  const [summary, setSummary] = useState<DirectoryFeaturedRevenueSummary>(emptySummary)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  const loadSummary = useCallback(async () => {
    if (!siteId) {
      setSummary(emptySummary)
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    const result = await getDirectoryFeaturedRevenueSummaryAction({ data: { siteId: siteId } })
    setLoading(false)
    if (result.error) {
      setError(result.error)
      setSummary(emptySummary)
      return
    }
    setSummary(result)
  }, [siteId, siteLoading])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)")
    const updateIsMobile = () => setIsMobile(mediaQuery.matches)

    updateIsMobile()
    mediaQuery.addEventListener("change", updateIsMobile)

    return () => mediaQuery.removeEventListener("change", updateIsMobile)
  }, [])

  const activeSummary = summary.currencies.find((entry) => entry.currency === selectedCurrency)
    ?? summary.currencies[0]
    ?? null
  const currency = activeSummary?.currency ?? "usd"
  const formatters = useMemo(() => buildRevenueFormatters(currency), [currency])

  const chartData = useMemo(() => {
    const points = (activeSummary?.months ?? []).map((month) => ({
      label: month.label,
      revenue: month.revenue / 100,
      purchases: month.purchases,
    }))
    return points.length > 0 ? points : [fallbackChartPoint]
  }, [activeSummary])
  const chartDisplayData = isMobile ? chartData.slice(-6) : chartData

  if (!siteId) {
    return siteLoading ? <AdminLoading className="min-h-64" /> : null
  }
  if (loading) return <AdminLoading className="min-h-64" />

  if (error) {
    return (
      <Card className="overflow-hidden">
        <ErrorBanner message={error} onRetry={loadSummary} />
      </Card>
    )
  }

  return (
    <CardGroup className="grid min-w-0">
      <CardGroup className="grid sm:grid-cols-3">
        <StatCard
          icon={BadgeDollarSign}
          label="Total Revenue"
          value={formatCentsAmount(activeSummary?.totalRevenue ?? 0, currency) ?? "-"}
          caption={`${(activeSummary?.totalPurchases ?? 0).toLocaleString()} featured ${activeSummary?.totalPurchases === 1 ? "purchase" : "purchases"} all time`}
        />
        <StatCard
          icon={Star}
          label="Active Featured"
          value={summary.activeCount.toLocaleString()}
          caption="Listings with a live featured placement"
        />
        <StatCard
          icon={Clock3}
          label="Expiring Soon"
          value={summary.expiringCount.toLocaleString()}
          caption={`Placements ending within ${EXPIRING_SOON_DAYS} days`}
        />
      </CardGroup>

      <CardGroup className="grid min-w-0 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>Revenue by Month</CardTitle>
              <CardDescription>
                Featured upgrade sales · last {isMobile ? 6 : 12} months
              </CardDescription>
            </div>
            {summary.currencies.length > 1 ? (
              <Select
                value={currency}
                onValueChange={(value) => setSelectedCurrency(value)}
              >
                <SelectTrigger size="sm" aria-label="Revenue currency">
                  <SelectValue />
                </SelectTrigger>
                {/* popper: the item-aligned default detaches from the trigger under browser zoom */}
                <SelectContent position="popper" align="end">
                  {summary.currencies.map((entry) => (
                    <SelectItem key={entry.currency} value={entry.currency}>
                      {entry.currency.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </CardHeader>
          <CardContent className="min-w-0">
            <ChartContainer config={chartConfig} className="h-[280px] min-w-0 w-full">
              <AreaChart accessibilityLayer data={chartDisplayData} margin={{ top: 32, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="monetizationRevenueGradient" x1="0" y1="0" x2="0" y2="1">
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
                  width={58}
                  tickFormatter={(value) => formatters.compact.format(Number(value))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                      formatter={(value, _name, item) => (
                        <div className="grid min-w-40 gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-1 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                            <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                              <span className="text-muted-foreground">Revenue</span>
                              <span className="font-mono font-medium tabular-nums text-foreground">
                                {formatters.full.format(Number(value))}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-4 pl-3 leading-none">
                            <span className="text-muted-foreground">Purchases</span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {Number(item.payload.purchases ?? 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    />
                  }
                />
                {/* monotone (not the dashboards' natural) — a natural spline undershoots
                    below $0 on zero-revenue months, which reads as negative revenue */}
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="revenue"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  fill="url(#monetizationRevenueGradient)"
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
                    formatter={(value) => formatters.compact.format(Number(value ?? 0))}
                  />
                </Area>
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Expiring Within {EXPIRING_SOON_DAYS} Days</CardTitle>
            <CardDescription>Featured placements ending soon</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {summary.expiringSoon.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No featured placements expire in the next {EXPIRING_SOON_DAYS} days.
              </p>
            ) : (
              <div className="min-w-0 space-y-3">
                {summary.expiringSoon.map((item) => {
                  const amount = formatCentsAmount(item.amount_total, item.currency)
                  return (
                    <div key={item.id} className="flex min-w-0 items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/directory/${item.directory_slug}`}
                          className="block truncate text-sm font-medium hover:underline"
                          title={item.directory_title}
                        >
                          {item.directory_title}
                        </Link>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={`${item.plan_name}${amount ? ` · ${amount}` : ""}`}
                        >
                          {item.plan_name}
                          {amount ? ` · ${amount}` : ""}
                          {item.owner_email ? ` · ${item.owner_email}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm">{formatShortDate(item.ends_at)}</div>
                        <div className="text-xs text-muted-foreground">{daysLeftLabel(item.ends_at)}</div>
                      </div>
                    </div>
                  )
                })}
                {summary.expiringCount > summary.expiringSoon.length ? (
                  <p className="text-xs text-muted-foreground">
                    Showing the first {summary.expiringSoon.length} of {summary.expiringCount} expiring placements.
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </CardGroup>
    </CardGroup>
  )
}
