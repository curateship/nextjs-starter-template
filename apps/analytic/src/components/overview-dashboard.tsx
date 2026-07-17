import * as React from "react"
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

import { DashboardRow } from "@/components/demo/dashboard-content"
import {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
  dashboardToolbarSegmentedButtonActiveClassName,
  dashboardToolbarSegmentedButtonClassName,
  dashboardToolbarSegmentedButtonInactiveClassName,
  dashboardToolbarSegmentedGroupClassName,
} from "@/components/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
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

const RANGE_PRESETS: { value: Exclude<OverviewRange, "custom">; label: string }[] =
  [
    { value: "today", label: "Today" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
  ]

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
  const [siteId, setSiteId] = React.useState(initialSiteId)
  const [range, setRange] = React.useState<OverviewRange>(initialRange)
  const [custom, setCustom] = React.useState<{ from: string; to: string }>({
    from: initialOverview.from,
    to: initialOverview.to,
  })
  const [overview, setOverview] = React.useState<SiteOverview>(initialOverview)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const activeSite = sites.find((site) => site.id === siteId) ?? sites[0]

  // The loader supplies the initial data, so fetches happen in response to the
  // user changing the site or range — not via a state-watching effect. A
  // monotonic token guards against out-of-order responses when changes race.
  const requestSeq = React.useRef(0)

  async function refresh(
    nextSiteId: string,
    nextRange: OverviewRange,
    nextCustom: { from: string; to: string }
  ) {
    // Custom needs both dates before it can resolve.
    if (nextRange === "custom" && (!nextCustom.from || !nextCustom.to)) return

    const seq = (requestSeq.current += 1)
    setLoading(true)
    setError(null)
    try {
      const next = await loadOverview({
        siteId: nextSiteId,
        range: nextRange,
        from: nextRange === "custom" ? nextCustom.from : undefined,
        to: nextRange === "custom" ? nextCustom.to : undefined,
      })
      if (seq === requestSeq.current) setOverview(next)
    } catch (err) {
      if (seq === requestSeq.current) setError(getOverviewErrorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  function selectSite(nextSiteId: string) {
    setSiteId(nextSiteId)
    void refresh(nextSiteId, range, custom)
  }

  function selectRange(nextRange: OverviewRange) {
    setRange(nextRange)
    void refresh(siteId, nextRange, custom)
  }

  function changeCustom(next: { from: string; to: string }) {
    setCustom(next)
    void refresh(siteId, "custom", next)
  }

  const hasData = overview.totals.pageViews > 0 || overview.totals.visitors > 0

  return (
    <div className="w-full space-y-4 pb-8 sm:space-y-6">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <TableSurface>
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <BarChart3Icon className="size-4 text-muted-foreground sm:size-[18px]" />
            <span className="text-sm font-medium sm:text-base">Overview</span>
            {loading ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </DashboardToolbarTitle>

          <DashboardToolbarControls>
            <Select value={siteId} onValueChange={selectSite}>
              <DashboardToolbarSelectTrigger className="min-w-40">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className={dashboardToolbarSegmentedGroupClassName}>
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => selectRange(preset.value)}
                  className={cn(
                    dashboardToolbarSegmentedButtonClassName,
                    range === preset.value
                      ? dashboardToolbarSegmentedButtonActiveClassName
                      : dashboardToolbarSegmentedButtonInactiveClassName
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => selectRange("custom")}
                className={cn(
                  dashboardToolbarSegmentedButtonClassName,
                  range === "custom"
                    ? dashboardToolbarSegmentedButtonActiveClassName
                    : dashboardToolbarSegmentedButtonInactiveClassName
                )}
              >
                Custom
              </button>
            </div>
          </DashboardToolbarControls>
        </DashboardToolbar>

        {range === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">From</span>
              <Input
                type="date"
                value={custom.from}
                max={custom.to}
                className="h-8 w-auto"
                onChange={(event) =>
                  changeCustom({ ...custom, from: event.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">To</span>
              <Input
                type="date"
                value={custom.to}
                min={custom.from}
                className="h-8 w-auto"
                onChange={(event) =>
                  changeCustom({ ...custom, to: event.target.value })
                }
              />
            </label>
          </div>
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
    <div className="bg-background p-4 sm:p-6">
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

function BreakdownTable({
  title,
  columnLabel,
  icon,
  items,
  emptyText,
}: {
  title: string
  columnLabel: string
  icon: React.ReactNode
  items: { key: string; count: number }[]
  emptyText: string
}) {
  const max = items.reduce((acc, item) => Math.max(acc, item.count), 0)

  return (
    <TableSurface className="flex-1">
      <DashboardToolbar>
        <DashboardToolbarTitle>
          {icon}
          <span className="text-sm font-medium sm:text-base">{title}</span>
        </DashboardToolbarTitle>
      </DashboardToolbar>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead column="main">{columnLabel}</TableHead>
            <TableHead column="meta">Views</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={2}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.key}>
                <TableCell column="main">
                  <div className="relative flex items-center">
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 rounded-sm bg-muted"
                      style={{
                        width: max ? `${(item.count / max) * 100}%` : "0%",
                      }}
                    />
                    <span className="relative truncate px-1 font-medium">
                      {item.key}
                    </span>
                  </div>
                </TableCell>
                <TableCell column="meta" className="tabular-nums">
                  {numberFormat.format(item.count)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableSurface>
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

function NoSitesState() {
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
