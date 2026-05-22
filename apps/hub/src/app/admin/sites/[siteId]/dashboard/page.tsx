import { Button } from '@/components/ui/button'
import { Card, CardGroup, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpRight, Settings, Edit3, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { ChartGroup7 } from '@/components/admin/layout/dashboard/analytics/chart-group7'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getSiteDashboardMetrics,
  getSiteForDashboard,
  getTopPages,
  getTopReferrers,
  type DashboardRange,
} from '@/lib/actions/analytics/analytics-actions'
import { isExternalQuickLinkHref, normalizeSiteQuickLinks, resolveSiteQuickLinkHref } from '@/lib/utils/site-quick-links'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

interface PageProps {
  params: Promise<{
    siteId: string
  }>
  searchParams?: Promise<{
    range?: string | string[]
  }>
}

function normalizeDashboardRange(value?: string | string[]): DashboardRange {
  const range = Array.isArray(value) ? value[0] : value
  return range === 'today' ||
    range === 'yesterday' ||
    range === '7d' ||
    range === '30d' ||
    range === '365d'
    ? range
    : 'today'
}

const rangeOptions: Array<{ value: DashboardRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: 'Month' },
  { value: '365d', label: 'Year' },
]

function DashboardRangeTabs({ siteId, value }: { siteId: string; value: DashboardRange }) {
  return (
    <Tabs value={value} className="w-full sm:w-auto">
      <TabsList className="h-9 max-w-full justify-start overflow-x-auto">
        {rangeOptions.map((option) => (
          <TabsTrigger key={option.value} value={option.value} asChild className="h-7 px-2.5 text-sm">
            <Link href={`/admin/sites/${siteId}/dashboard?range=${option.value}`} scroll={false}>
              {option.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export default async function SiteDashboard({ params, searchParams }: PageProps) {
  const { siteId } = await params
  const resolvedSearchParams = await searchParams
  const rawRange = Array.isArray(resolvedSearchParams?.range)
    ? resolvedSearchParams?.range[0]
    : resolvedSearchParams?.range
  const selectedRange = normalizeDashboardRange(rawRange)

  if (rawRange !== selectedRange) {
    redirect(`/admin/sites/${siteId}/dashboard?range=${selectedRange}`)
  }

  const [site, cardMetrics, chartMetrics, topPages, topReferrers] = await Promise.all([
    getSiteForDashboard(siteId),
    getSiteDashboardMetrics(siteId, selectedRange).catch(() => ({
      totals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
      previousTotals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
      chartData: [],
    })),
    getSiteDashboardMetrics(siteId, '30d').catch(() => ({
      totals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
      previousTotals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
      chartData: [],
    })),
    getTopPages(siteId, selectedRange).catch(() => []),
    getTopReferrers(siteId, selectedRange).catch(() => []),
  ])
  const siteUrl = site ? getSiteUrl(site) : null
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

  return (
    <>
      <StickyHeader navLinks={quickLinks} />
      <AdminLayout>
        <div className="w-full">
          <CardGroup className="grid">
            <div className="flex max-w-full flex-col gap-3 overflow-x-auto sm:flex-row sm:items-center sm:justify-between lg:gap-6">
              <DashboardRangeTabs siteId={siteId} value={selectedRange} />
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
        </div>
      </AdminLayout>
    </>
  )
}
