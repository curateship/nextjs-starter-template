import Link from "next/link"
import { Suspense } from "react"
import { ArrowUpRight, Check, ChevronDown, Edit3, ExternalLink, Settings } from "lucide-react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { ChartGroup7 } from "@/components/admin/layout/dashboard/analytics/chart-group7"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getSiteDashboardMetrics,
  getSiteForDashboard,
  getTopPages,
  getTopReferrers,
  type DashboardRange,
  type SiteDashboardMetrics,
} from "@/lib/actions/analytics/analytics-actions"
import { isExternalQuickLinkHref, normalizeSiteQuickLinks, resolveSiteQuickLinkHref } from "@/lib/utils/site-quick-links"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
  searchParams: Promise<{
    range?: string | string[]
  }>
}

const emptyMetrics: SiteDashboardMetrics = {
  totals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
  previousTotals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
  chartData: [],
}

const rangeOptions: Array<{ value: DashboardRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "Month" },
  { value: "365d", label: "Year" },
]

function sumDashboardPoints(points: SiteDashboardMetrics["chartData"]): SiteDashboardMetrics["totals"] {
  return points.reduce(
    (totals, point) => ({
      visitors: totals.visitors + point.visitors,
      contacts: totals.contacts + point.contacts,
      orders: totals.orders + point.orders,
      revenue: totals.revenue + point.revenue,
    }),
    { visitors: 0, contacts: 0, orders: 0, revenue: 0 }
  )
}

function deriveCardMetricsFromThirtyDay(
  metrics: SiteDashboardMetrics,
  range: DashboardRange
): SiteDashboardMetrics | null {
  if (range === "30d") return metrics
  if (range === "today") {
    return {
      ...metrics,
      totals: sumDashboardPoints(metrics.chartData.slice(-1)),
      previousTotals: sumDashboardPoints(metrics.chartData.slice(-2, -1)),
    }
  }
  if (range === "yesterday") {
    return {
      ...metrics,
      totals: sumDashboardPoints(metrics.chartData.slice(-2, -1)),
      previousTotals: sumDashboardPoints(metrics.chartData.slice(-3, -2)),
    }
  }
  if (range === "7d") {
    return {
      ...metrics,
      totals: sumDashboardPoints(metrics.chartData.slice(-7)),
      previousTotals: sumDashboardPoints(metrics.chartData.slice(-14, -7)),
    }
  }
  return null
}

function normalizeDashboardRange(value?: string | null): DashboardRange {
  return value === "today" ||
    value === "yesterday" ||
    value === "7d" ||
    value === "30d" ||
    value === "365d"
    ? value
    : "today"
}

function DashboardRangeDropdown({
  siteId,
  value,
}: {
  siteId: string
  value: DashboardRange
}) {
  const selectedOption = rangeOptions.find((option) => option.value === value) ?? rangeOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-28 justify-between">
          {selectedOption.label}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {rangeOptions.map((option) => (
          <DropdownMenuItem key={option.value} asChild>
            <Link
              className="justify-between"
              href={`/admin/sites/${siteId}/dashboard?range=${option.value}`}
              scroll={false}
            >
              {option.label}
              {option.value === value ? <Check className="h-4 w-4" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DashboardRangeTabs({
  siteId,
  value,
}: {
  siteId: string
  value: DashboardRange
}) {
  return (
    <Tabs value={value}>
      <TabsList className="h-8">
        {rangeOptions.map((option) => (
          <TabsTrigger key={option.value} value={option.value} asChild className="h-6 px-2 text-sm">
            <Link
              href={`/admin/sites/${siteId}/dashboard?range=${option.value}`}
              scroll={false}
            >
              {option.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function TopListFallback({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

async function TopPagesCard({ siteId, range }: { siteId: string; range: DashboardRange }) {
  const topPages = await getTopPages(siteId, range).catch(() => [])

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Top Pages</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        {topPages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet</p>
        ) : (
          <div className="min-w-0 space-y-3">
            {topPages.map((page) => (
              <div key={page.path} className="flex min-w-0 items-center justify-between gap-4">
                <span className="min-w-0 flex-1 truncate text-sm">{page.path}</span>
                <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
                  {page.views.toLocaleString()} views
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

async function TopReferrersCard({ siteId, range }: { siteId: string; range: DashboardRange }) {
  const topReferrers = await getTopReferrers(siteId, range).catch(() => [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Referrers</CardTitle>
      </CardHeader>
      <CardContent>
        {topReferrers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No referrer data yet</p>
        ) : (
          <div className="space-y-3">
            {topReferrers.map((ref) => (
              <div key={ref.domain} className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{ref.domain}</span>
                </div>
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {ref.visits.toLocaleString()} visits
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default async function SiteDashboard({ params, searchParams }: PageProps) {
  const { siteId } = await params
  const resolvedSearchParams = await searchParams
  const rawRange = Array.isArray(resolvedSearchParams.range)
    ? resolvedSearchParams.range[0]
    : resolvedSearchParams.range
  const selectedRange = normalizeDashboardRange(rawRange)
  const chartMetricsPromise = getSiteDashboardMetrics(siteId, "30d").catch(() => emptyMetrics)
  const selectedMetricsPromise = selectedRange === "365d"
    ? getSiteDashboardMetrics(siteId, selectedRange).catch(() => emptyMetrics)
    : null
  const [site, chartMetrics, selectedMetrics] = await Promise.all([
    getSiteForDashboard(siteId),
    chartMetricsPromise,
    selectedMetricsPromise,
  ])
  const cardMetrics = selectedMetrics ?? deriveCardMetricsFromThirtyDay(chartMetrics, selectedRange) ?? emptyMetrics

  const siteSettings = (site?.settings ?? {}) as {
    quick_links?: unknown
  }

  const quickLinks = normalizeSiteQuickLinks(siteSettings.quick_links).flatMap((link) => {
    const href = resolveSiteQuickLinkHref(link, siteId)
    if (!href) return []

    return [{
      label: link.label,
      href,
      iconName: link.icon,
      external: isExternalQuickLinkHref(link.href),
    }]
  })
  const siteUrl = site ? getSiteUrl(site) : null

  return (
    <>
      <StickyHeader navLinks={quickLinks} />
      <AdminLayout>
        <div className="w-full">
          <CardGroup className="grid lg:gap-6">
            <div className="flex max-w-full items-center justify-between gap-3 lg:gap-6">
              <div className="sm:hidden">
                <DashboardRangeDropdown
                  siteId={siteId}
                  value={selectedRange}
                />
              </div>
              <div className="hidden sm:block">
                <DashboardRangeTabs
                  siteId={siteId}
                  value={selectedRange}
                />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {siteUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={siteUrl} target="_blank" rel="noopener noreferrer" aria-label="View Site" title="View Site">
                      <ExternalLink className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">View Site</span>
                    </a>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/sites/${siteId}/settings`} aria-label="Settings" title="Settings">
                    <Settings className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Settings</span>
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/admin/pages/${siteId}`} aria-label="Site Builder" title="Site Builder">
                    <Edit3 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Site Builder</span>
                  </Link>
                </Button>
              </div>
            </div>

            <ChartGroup7
              cardRange={selectedRange}
              chartData={chartMetrics.chartData}
              chartRange="30d"
              previousTotals={cardMetrics.previousTotals}
              totals={cardMetrics.totals}
            />

            <CardGroup className="grid lg:grid-cols-2">
              <Suspense fallback={<TopListFallback title="Top Pages" />}>
                <TopPagesCard siteId={siteId} range="30d" />
              </Suspense>
              <Suspense fallback={<TopListFallback title="Top Referrers" />}>
                <TopReferrersCard siteId={siteId} range="30d" />
              </Suspense>
            </CardGroup>
          </CardGroup>
        </div>
      </AdminLayout>
    </>
  )
}
