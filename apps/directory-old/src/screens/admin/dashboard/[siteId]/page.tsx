import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { MultiSiteDashboard } from "@/components/admin/layout/dashboard/multi-site/MultiSiteDashboard"
import {
  getMultiSiteDashboardData,
  type DashboardRange,
  type MultiSiteDashboardData,
} from "@/lib/actions/analytics/analytics-actions"
import { getRecentAutomationRunsForSiteImpl } from "@/lib/actions/automations/automation-actions.server"
import { listHubNotificationPageImpl } from "@/lib/actions/notifications/notification-actions.server"
import { getAllSitesActionImpl, getSiteByIdActionImpl } from "@/lib/actions/sites/site-actions.server"
import { redirect } from "@/lib/navigation-server"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
  searchParams: Promise<{
    range?: string | string[]
  }>
}

function normalizeDashboardRange(value?: string | null): DashboardRange {
  return value === "today" || value === "7d" || value === "365d" ? value : "30d"
}

const emptyMetrics = (range: DashboardRange): MultiSiteDashboardData => ({
  range,
  chartData: [],
  totals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
  previousTotals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
  perSite: [],
})

// Per-site dashboard at /admin/dashboard/<subdomain>: the same UI as the multi-site /admin
// dashboard, but the chart, automations, and notifications are scoped to this one site. The
// "Your sites" table still spans every site so the user keeps a portfolio-wide view from here.
export default async function SiteDashboard({ params, searchParams }: PageProps) {
  const { siteId } = await params
  const resolvedSearchParams = await searchParams
  const rawRange = Array.isArray(resolvedSearchParams.range)
    ? resolvedSearchParams.range[0]
    : resolvedSearchParams.range
  const range = normalizeDashboardRange(rawRange)

  // Resolve the URL param (a site id) to the owning site first, since every scoped query below
  // keys off it. An unknown or non-owned id falls back to the all-sites view.
  const { data: site } = await getSiteByIdActionImpl(siteId)
  if (!site) redirect("/admin/dashboard")

  const [sitesResult, metrics, notifications, automationRuns] = await Promise.all([
    getAllSitesActionImpl(),
    getMultiSiteDashboardData(range, site.id).catch(() => emptyMetrics(range)),
    listHubNotificationPageImpl({ siteId: site.id, limit: 8 }).catch(() => ({
      notifications: [],
      next_cursor: null,
      unread_count: 0,
    })),
    getRecentAutomationRunsForSiteImpl(site.id, 8).catch(() => ({ data: [], error: null })),
  ])

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <MultiSiteDashboard
          sites={sitesResult.data ?? []}
          metrics={metrics}
          notifications={{
            items: notifications.notifications,
            unreadCount: notifications.unread_count,
          }}
          automationRuns={automationRuns.data}
          scope={{ kind: "site", siteId: site.id, siteName: site.name }}
        />
      </AdminLayout>
    </>
  )
}
