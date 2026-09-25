import { Link } from "@tanstack/react-router"
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  ExternalLinkIcon,
  GlobeIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react"

import { BreakdownTable } from "@/components/breakdown-table"
import { DashboardRow } from "@/components/demo/dashboard-content"
import {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
import {
  CustomRangeFields,
  SiteRangeControls,
} from "@/components/site-range-controls"
import { useSiteRangeQuery } from "@/hooks/use-site-range-query"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { TableSurface } from "@/components/ui/table"
import {
  getOverviewErrorMessage,
  loadOverview,
  type OverviewRange,
  type SiteOverview,
} from "@/lib/api/overview"
import type { SiteItem } from "@/lib/api/sites"
import { cn } from "@/lib/utils"

const chartConfig = {
  pageViews: { label: "Page views", color: "var(--chart-2)" },
  visitors: { label: "Visitors", color: "var(--chart-4)" },
} satisfies ChartConfig

const numberFormat = new Intl.NumberFormat()

function formatDayShort(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`)
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function OverviewDashboard({
  sites,
  initialSiteId,
  initialRange,
  initialOverview,
}: {
  sites: SiteItem[]
  initialSiteId: string | null
  initialRange: OverviewRange
  initialOverview: SiteOverview | null
}) {
  if (sites.length === 0 || !initialSiteId || !initialOverview) {
    return <NoSitesState />
  }

  return (
    <OverviewBody
      sites={sites}
      initialSiteId={initialSiteId}
      initialRange={initialRange}
      initialOverview={initialOverview}
    />
  )
}

function OverviewBody({
  sites,
  initialSiteId,
  initialRange,
  initialOverview,
}: {
  sites: SiteItem[]
  initialSiteId: string
  initialRange: OverviewRange
  initialOverview: SiteOverview
}) {
  const {
    siteId,
    range,
    custom,
    data: overview,
    loading,
    error,
    selectSite,
    selectRange,
    changeCustom,
  } = useSiteRangeQuery<SiteOverview>({
    initialSiteId,
    initialRange,
    initialCustom: { from: initialOverview.from, to: initialOverview.to },
    initialData: initialOverview,
    load: loadOverview,
    errorMessage: getOverviewErrorMessage,
  })

  const activeSite = sites.find((site) => site.id === siteId) ?? sites[0]

  const hasData = overview.totals.pageViews > 0 || overview.totals.visitors > 0

  return (
    <div className="w-full space-y-[var(--shell-gutter,0.75rem)]">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <TableSurface>
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <BarChart3Icon className="text-muted-foreground" />
            <span className="text-sm font-medium sm:text-base">Overview</span>
            {loading ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </DashboardToolbarTitle>

          <DashboardToolbarControls>
            <SiteRangeControls
              sites={sites}
              siteId={siteId}
              range={range}
              onSiteChange={selectSite}
              onRangeChange={selectRange}
            />
          </DashboardToolbarControls>
        </DashboardToolbar>

        {range === "custom" ? (
          <CustomRangeFields custom={custom} onChange={changeCustom} />
        ) : null}

        <div className="grid gap-px bg-border sm:grid-cols-2">
          <StatTile
            label="Visitors"
            value={overview.totals.visitors}
            previous={overview.previous.visitors}
          />
          <StatTile
            label="Page views"
            value={overview.totals.pageViews}
            previous={overview.previous.pageViews}
          />
        </div>

        <div className="p-4 sm:p-6">
          {hasData ? (
            <TrendChart series={overview.series} />
          ) : (
            <EmptyDataState site={activeSite} />
          )}
        </div>
      </TableSurface>

      <DashboardRow>
        <BreakdownTable
          title="Top pages"
          columnLabel="Page"
          icon={<GlobeIcon className="size-4 text-muted-foreground" />}
          items={overview.topPages}
          emptyText="No page views in this range yet."
        />
        <BreakdownTable
          title="Top referrers"
          columnLabel="Source"
          icon={<ExternalLinkIcon className="size-4 text-muted-foreground" />}
          items={overview.topReferrers}
          emptyText="No referrers in this range yet."
        />
      </DashboardRow>
    </div>
  )
}

function StatTile({
  label,
  value,
  previous,
}: {
  label: string
  value: number
  previous: number
}) {
  const delta = computeDelta(value, previous)
  return (
    <div className="bg-card p-4 sm:p-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums sm:text-3xl">
          {numberFormat.format(value)}
        </span>
        {delta ? (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              delta.direction === "up" && "text-emerald-600 dark:text-emerald-500",
              delta.direction === "down" && "text-red-600 dark:text-red-500",
              delta.direction === "flat" && "text-muted-foreground"
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRightIcon className="size-3.5" />
            ) : delta.direction === "down" ? (
              <ArrowDownRightIcon className="size-3.5" />
            ) : null}
            {delta.label}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        vs. {numberFormat.format(previous)} previous period
      </div>
    </div>
  )
}

function TrendChart({ series }: { series: SiteOverview["series"] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
      <AreaChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillPageViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-pageViews)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-pageViews)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillVisitors" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-visitors)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-visitors)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={formatDayShort}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          allowDecimals={false}
          tickFormatter={(value: number) => numberFormat.format(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatDayShort(String(value))}
            />
          }
        />
        <Area
          dataKey="pageViews"
          type="monotone"
          stroke="var(--color-pageViews)"
          fill="url(#fillPageViews)"
          strokeWidth={2}
        />
        <Area
          dataKey="visitors"
          type="monotone"
          stroke="var(--color-visitors)"
          fill="url(#fillVisitors)"
          strokeWidth={2}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}

function EmptyDataState({ site }: { site: SiteItem }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/40">
        <GlobeIcon className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">No data yet for {site.name}</p>
        <p className="text-sm text-muted-foreground">
          Install the tracking snippet, then load a page on your site.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link to="/sites/$siteId" params={{ siteId: site.id }}>
          Set up tracking
        </Link>
      </Button>
    </div>
  )
}

// Shared by the report screens (Overview, Audience) when no site exists yet.
export function NoSitesState() {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-border bg-muted/40">
        <BarChart3Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-medium">No sites yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add your first site to get a tracking snippet. Once it's installed,
          your visitor stats show up here.
        </p>
      </div>
      <Button asChild>
        <Link to="/sites">
          <PlusIcon className="size-4" />
          Add a site
        </Link>
      </Button>
    </div>
  )
}

type Delta = { direction: "up" | "down" | "flat"; label: string }

function computeDelta(current: number, previous: number): Delta | null {
  if (previous === 0) {
    if (current === 0) return null
    return { direction: "up", label: "New" }
  }
  const change = ((current - previous) / previous) * 100
  const rounded = Math.round(change)
  if (rounded === 0) return { direction: "flat", label: "0%" }
  return {
    direction: rounded > 0 ? "up" : "down",
    label: `${rounded > 0 ? "+" : ""}${rounded}%`,
  }
}
