import * as React from "react"
import { LineChartIcon, Loader2Icon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  chartHeightClassName,
  ChartCard,
  EmptyChart,
} from "@/components/shared/dashboard/chart-card"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getOwnerListingViewsErrorMessage,
  loadOwnerListingViews,
  type OwnerListingViewRange,
  type OwnerListingViews,
} from "@/lib/api/directory/views"
import { formatUtcDate } from "@/lib/format/format-time"

const viewsConfig: ChartConfig = {
  views: { label: "Views", color: "var(--primary)" },
}

export function ListingViewsPanel({ listingId }: { listingId: string }) {
  const [days, setDays] = React.useState<OwnerListingViewRange>(30)
  const [analytics, setAnalytics] = React.useState<OwnerListingViews | null>(
    null
  )
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let active = true

    void loadOwnerListingViews({ listingId, days })
      .then((result) => {
        if (active) setAnalytics(result)
      })
      .catch((reason) => {
        if (active) setError(getOwnerListingViewsErrorMessage(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [attempt, days, listingId])

  return (
    <ChartCard
      icon={LineChartIcon}
      title="Listing views"
      meta={
        loading && analytics ? (
          <Loader2Icon
            className="size-3.5 animate-spin"
            aria-label="Refreshing listing views"
          />
        ) : undefined
      }
      control={
        <Tabs
          value={String(days)}
          onValueChange={(value) => {
            setLoading(true)
            setError("")
            setDays(value === "90" ? 90 : 30)
          }}
        >
          <TabsList>
            <TabsTrigger value="30">30 days</TabsTrigger>
            <TabsTrigger value="90">90 days</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {loading && !analytics ? (
        <div className="flex min-h-[200px] items-center justify-center sm:min-h-[240px]">
          <Loader2Icon
            className="size-4 animate-spin text-muted-foreground"
            aria-label="Loading listing views"
          />
        </div>
      ) : error ? (
        <div className="grid min-h-[200px] content-center justify-items-center gap-2 text-center sm:min-h-[240px]">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true)
              setError("")
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </Button>
        </div>
      ) : analytics && analytics.total > 0 ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold tabular-nums">
                {analytics.total.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                {comparisonText(analytics)}
              </p>
            </div>
            {analytics.busiestDay ? (
              <p className="text-sm text-muted-foreground">
                Busiest day was {formatUtcDate(analytics.busiestDay.day)} with{" "}
                {analytics.busiestDay.views.toLocaleString()}{" "}
                {analytics.busiestDay.views === 1 ? "view" : "views"}.
              </p>
            ) : null}
          </div>
          <ViewsChart analytics={analytics} />
        </>
      ) : (
        <EmptyChart
          message={
            analytics?.previousTotal
              ? `No views have been counted in the last ${days} days. The ${days} days before had ${analytics.previousTotal.toLocaleString()}.`
              : `No views have been counted for this listing in the last ${days} days yet.`
          }
        />
      )}
    </ChartCard>
  )
}

function comparisonText(analytics: OwnerListingViews): string {
  const before = analytics.previousTotal.toLocaleString()
  if (analytics.total > analytics.previousTotal) {
    return `Up from ${before} in the previous ${analytics.days} days.`
  }
  if (analytics.total < analytics.previousTotal) {
    return `Down from ${before} in the previous ${analytics.days} days.`
  }
  return `The same as the previous ${analytics.days} days: ${before} views.`
}

function ViewsChart({ analytics }: { analytics: OwnerListingViews }) {
  const data = analytics.daily.map((point) => ({
    day: point.day,
    label: new Date(`${point.day}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }),
    views: point.views,
  }))

  return (
    <div className={chartHeightClassName} data-owner-views-chart>
      <ChartContainer config={viewsConfig} className="h-full w-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            dy={8}
            interval={data.length > 45 ? 13 : data.length > 20 ? 5 : 1}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, dx: -5 }}
            width={36}
            allowDecimals={false}
          />
          <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
          <Bar
            dataKey="views"
            fill="var(--color-views)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
