import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Globe, TrendingDown, Clock, Settings, Edit3 } from 'lucide-react'
import { ChartLineLabel } from '@/components/admin/layout/dashboard/charts/ChartLineLabel'
import Link from 'next/link'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/dashboard/StickyHeader'
import { SaveAsThemeButton } from '@/components/admin/themes/SaveAsThemeButton'
import { getAnalyticsOverview, getTrafficOverTime, getSiteForDashboard } from '@/lib/actions/analytics/analytics-actions'
import { ChartBarVisitors } from '@/components/admin/layout/dashboard/charts/ChartBarVisitors'
import { isExternalQuickLinkHref, normalizeSiteQuickLinks, resolveSiteQuickLinkHref } from '@/lib/utils/site-quick-links'

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
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

export default async function SiteDashboard({ params }: PageProps) {
  const { siteId } = await params

  // Get the site data and analytics in parallel
  const defaultAnalytics = { pageViews: 0, uniqueVisitors: 0, bounceRate: 0, avgDuration: 0 }
  const [site, analytics, traffic] = await Promise.all([
    getSiteForDashboard(siteId),
    getAnalyticsOverview(siteId, '30d').catch(() => defaultAnalytics),
    getTrafficOverTime(siteId, '7d').catch(() => []),
  ])
  const siteName = site?.name || `Site ${siteId}`
  const siteUrl = site?.subdomain ? `${site.subdomain}.domain.com` : 'Unknown domain'
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
      <StickyHeader navLinks={quickLinks} />
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
            actions={
              <div className="flex items-center gap-2">
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
              </div>
            }
          />

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4">
        <ChartBarVisitors data={traffic} totalVisitors={analytics.uniqueVisitors} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.pageViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.bounceRate}%</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Session</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(analytics.avgDuration)}</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-2">
        {/* Line Chart */}
        <ChartLineLabel />

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks for managing your site</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`/admin/pages/${siteId}`}>
                <Edit3 className="mr-2 h-4 w-4" />
                Edit Site Content
              </Link>
            </Button>
            <SaveAsThemeButton siteId={siteId} siteName={siteName} fullWidth />
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`/admin/posts/new`}>
                <Edit3 className="mr-2 h-4 w-4" />
                Create New Post
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`/admin/products/new`}>
                <Edit3 className="mr-2 h-4 w-4" />
                Add Product
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`/admin/sites/${siteId}/pages`}>
                <Edit3 className="mr-2 h-4 w-4" />
                Manage Pages
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`/admin/sites/${siteId}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Site Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      </div>
      </AdminLayout>
    </>
  )
}
