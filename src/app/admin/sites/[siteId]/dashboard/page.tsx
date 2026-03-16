import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Globe, TrendingDown, Clock, Settings, Edit3 } from 'lucide-react'
import { ChartLineLabel } from '@/components/admin/dashboard/ChartLineLabel'
import Link from 'next/link'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { AdminPageHeader } from '@/components/admin/layout/dashboard/AdminPageHeader'
import { StickyHeader } from '@/components/admin/layout/dashboard/StickyHeader'
import { SaveAsThemeButton } from '@/components/admin/themes/SaveAsThemeButton'
import { getAnalyticsOverview, getTrafficOverTime, getSiteForDashboard } from '@/lib/actions/analytics/analytics-actions'
import { ChartBarVisitors } from '@/components/admin/dashboard/ChartBarVisitors'

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

export default async function SiteDashboard({ params }: PageProps) {
  const { siteId } = await params

  // Get the site data and analytics in parallel
  const [site, analytics, traffic] = await Promise.all([
    getSiteForDashboard(siteId),
    getAnalyticsOverview(siteId, '30d'),
    getTrafficOverTime(siteId, '7d'),
  ])
  const siteName = site?.name || `Site ${siteId}`
  const siteUrl = site?.subdomain ? `${site.subdomain}.domain.com` : 'Unknown domain'

  return (
    <>
      <StickyHeader
        rightActions={
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
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title={`${siteName} Dashboard`}
            subtitle={`Overview and analytics for ${siteName} (${siteUrl})`}
            extraContent={
              <Badge className="bg-green-500 hover:bg-green-600 text-white">Live</Badge>
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