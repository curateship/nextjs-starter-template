import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { MultiSiteDashboard } from "@/components/admin/layout/dashboard/multi-site/MultiSiteDashboard"
import {
  getMultiSiteDashboardData,
  type DashboardRange,
  type MultiSiteDashboardData,
} from "@/lib/actions/analytics/analytics-actions"
import { getRecentAutomationRunsForUserImpl } from "@/lib/actions/automations/automation-actions.server"
import { listHubNotificationsForUserImpl } from "@/lib/actions/notifications/notification-actions.server"
import { getAllSitesActionImpl } from "@/lib/actions/sites/site-actions.server"

interface PageProps {
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

export default async function AdminDashboard({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const rawRange = Array.isArray(resolvedSearchParams.range)
    ? resolvedSearchParams.range[0]
    : resolvedSearchParams.range
  const range = normalizeDashboardRange(rawRange)

  const [sitesResult, metrics, notifications, automationRuns] = await Promise.all([
    getAllSitesActionImpl(),
    getMultiSiteDashboardData(range).catch(() => emptyMetrics(range)),
    listHubNotificationsForUserImpl({ limit: 8 }).catch(() => ({
      notifications: [],
      next_cursor: null,
      unread_count: 0,
    })),
    getRecentAutomationRunsForUserImpl(8).catch(() => ({ data: [], error: null })),
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
        />
      </AdminLayout>
    </>
  )
}
