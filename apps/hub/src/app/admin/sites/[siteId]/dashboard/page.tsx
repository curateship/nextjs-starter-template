import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Settings, Edit3, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { ChartGroup7 } from '@/components/chart-group7'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getSiteDashboardMetrics, getSiteForDashboard, type DashboardRange } from '@/lib/actions/analytics/analytics-actions'
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
    range === '30d' ||
    range === '365d'
    ? range
    : '7d'
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
          <TabsTrigger key={option.value} value={option.value} asChild className="h-7 px-2.5 text-xs">
            <Link href={`/admin/sites/${siteId}/dashboard?range=${option.value}`} scroll={false}>
              {option.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function getSiteStatusBadge(status?: string) {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'bg-green-500 hover:bg-green-600 text-white' }
    case 'inactive':
      return { label: 'Inactive', className: 'bg-red-500 hover:bg-red-600 text-white' }
    case 'suspended':
      return { label: 'Suspended', className: 'bg-gray-500 hover:bg-gray-600 text-white' }
    case 'draft':
    default:
      return { label: 'Draft', className: 'bg-yellow-500 hover:bg-yellow-600 text-white' }
  }
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

  const [site, dashboardMetrics] = await Promise.all([
    getSiteForDashboard(siteId),
    getSiteDashboardMetrics(siteId, selectedRange).catch(() => ({
      totals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
      previousTotals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
      chartData: [],
    })),
  ])
  const siteName = site?.name || `Site ${siteId}`
  const siteUrl = site ? getSiteUrl(site) : null
  const siteSettings = (site?.settings ?? {}) as {
    maintenance?: { enabled?: boolean }
    quick_links?: unknown
  }
  const siteStatusBadge = getSiteStatusBadge(site?.status)
  const isMaintenanceMode = siteSettings.maintenance?.enabled === true
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
      <StickyHeader
        navLinks={quickLinks}
        rightActions={
          <>
            {siteUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Site
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/sites/${siteId}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/admin/pages/${siteId}`}>
                <Edit3 className="mr-2 h-4 w-4" />
                Site Builder
              </Link>
            </Button>
          </>
        }
      />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Sites", href: "/admin/sites" },
              {
                label: (
                  <span className="inline-flex items-center gap-2">
                    <span>{siteName}</span>
                    <Badge className={siteStatusBadge.className}>{siteStatusBadge.label}</Badge>
                    {isMaintenanceMode && (
                      <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Maintenance</Badge>
                    )}
                  </span>
                ),
              },
            ]}
            rightContent={<DashboardRangeTabs siteId={siteId} value={selectedRange} />}
          />

          <ChartGroup7
            chartData={dashboardMetrics.chartData}
            previousTotals={dashboardMetrics.previousTotals}
            range={selectedRange}
            totals={dashboardMetrics.totals}
          />
        </div>
      </AdminLayout>
    </>
  )
}
