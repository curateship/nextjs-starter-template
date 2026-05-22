"use client"

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowUpRight, Edit3, ExternalLink, Settings } from "lucide-react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { ChartGroup7 } from "@/components/admin/layout/dashboard/analytics/chart-group7"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getSiteDashboardData,
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

type DashboardData = Awaited<ReturnType<typeof getSiteDashboardData>>
type DashboardSite = DashboardData["site"]
type TopPage = DashboardData["topPages"][number]
type TopReferrer = DashboardData["topReferrers"][number]

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

function normalizeDashboardRange(value?: string | null): DashboardRange {
  return value === "today" ||
    value === "yesterday" ||
    value === "7d" ||
    value === "30d" ||
    value === "365d"
    ? value
    : "today"
}

function DashboardRangeTabs({
  siteId,
  value,
  onRangeClick,
}: {
  siteId: string
  value: DashboardRange
  onRangeClick: (value: DashboardRange) => void
}) {
  return (
    <Tabs value={value} className="w-full sm:w-auto">
      <TabsList className="h-9 max-w-full justify-start overflow-x-auto">
        {rangeOptions.map((option) => (
          <TabsTrigger key={option.value} value={option.value} asChild className="h-7 px-2.5 text-sm">
            <Link
              href={`/admin/sites/${siteId}/dashboard?range=${option.value}`}
              scroll={false}
              onClick={() => onRangeClick(option.value)}
            >
              {option.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function DashboardSkeleton() {
  return (
    <CardGroup className="grid">
      <div className="flex max-w-full flex-col gap-3 overflow-x-auto sm:flex-row sm:items-center sm:justify-between lg:gap-6">
        <div className="h-9 w-[268px] max-w-full rounded-md bg-muted animate-pulse" />
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <div className="h-9 w-24 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-24 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
        </div>
      </div>

      <CardGroup className="grid sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-4 w-14 rounded bg-muted animate-pulse" />
            </CardHeader>
          </Card>
        ))}
      </CardGroup>

      <Card className="shadow-none">
        <CardHeader className="gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="h-6 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-[278px] max-w-full rounded-md bg-muted animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-[360px] w-full" />
        </CardContent>
      </Card>

      <CardGroup className="grid lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="shadow-none">
            <CardHeader>
              <div className="h-6 w-28 rounded bg-muted animate-pulse" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center justify-between gap-4">
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </CardGroup>
    </CardGroup>
  )
}

export default function SiteDashboard({ params, searchParams }: PageProps) {
  const { siteId } = use(params)
  const resolvedSearchParams = use(searchParams)
  const router = useRouter()
  const rawRange = Array.isArray(resolvedSearchParams.range)
    ? resolvedSearchParams.range[0]
    : resolvedSearchParams.range
  const selectedRange = normalizeDashboardRange(rawRange)
  const [site, setSite] = useState<DashboardSite>(null)
  const [cardMetrics, setCardMetrics] = useState<SiteDashboardMetrics>(emptyMetrics)
  const [chartMetrics, setChartMetrics] = useState<SiteDashboardMetrics>(emptyMetrics)
  const [topPages, setTopPages] = useState<TopPage[]>([])
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (rawRange !== selectedRange) {
      router.replace(`/admin/sites/${siteId}/dashboard?range=${selectedRange}`)
    }
  }, [rawRange, router, selectedRange, siteId])

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)

      const data = await getSiteDashboardData(siteId, selectedRange).catch(() => null)

      if (cancelled) return

      setSite(data?.site ?? null)
      setCardMetrics(data?.cardMetrics ?? emptyMetrics)
      setChartMetrics(data?.chartMetrics ?? emptyMetrics)
      setTopPages(data?.topPages ?? [])
      setTopReferrers(data?.topReferrers ?? [])
      setLoading(false)
    }

    loadDashboard()

    return () => {
      cancelled = true
    }
  }, [selectedRange, siteId])

  const quickLinks = useMemo(() => {
    const siteSettings = (site?.settings ?? {}) as {
      quick_links?: unknown
    }

    return normalizeSiteQuickLinks(siteSettings.quick_links).flatMap((link) => {
      const href = resolveSiteQuickLinkHref(link, siteId)
      if (!href) return []

      return [{
        label: link.label,
        href,
        iconName: link.icon,
        external: isExternalQuickLinkHref(link.href),
      }]
    })
  }, [site?.settings, siteId])
  const siteUrl = site ? getSiteUrl(site) : null

  return (
    <>
      <StickyHeader navLinks={quickLinks} />
      <AdminLayout>
        <div className="w-full">
          {loading ? (
            <DashboardSkeleton />
          ) : (
            <CardGroup className="grid">
              <div className="flex max-w-full flex-col gap-3 overflow-x-auto sm:flex-row sm:items-center sm:justify-between lg:gap-6">
                <DashboardRangeTabs
                  siteId={siteId}
                  value={selectedRange}
                  onRangeClick={(range) => {
                    if (range !== selectedRange) setLoading(true)
                  }}
                />
                <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                  {siteUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={siteUrl} target="_blank" rel="noopener noreferrer" aria-label="View Site" title="View Site">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        <span>View Site</span>
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/sites/${siteId}/settings`} aria-label="Settings" title="Settings">
                      <Settings className="h-4 w-4 mr-2" />
                      <span>Settings</span>
                    </Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href={`/admin/pages/${siteId}`} aria-label="Site Builder" title="Site Builder">
                      <Edit3 className="h-4 w-4 mr-2" />
                      <span>Site Builder</span>
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
                <Card>
                  <CardHeader>
                    <CardTitle>Top Pages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {topPages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data yet</p>
                    ) : (
                      <div className="space-y-3">
                        {topPages.map((page) => (
                          <div key={page.path} className="flex items-center justify-between">
                            <span className="mr-4 truncate text-sm">{page.path}</span>
                            <span className="whitespace-nowrap text-sm text-muted-foreground">
                              {page.views.toLocaleString()} views
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

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
              </CardGroup>
            </CardGroup>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
