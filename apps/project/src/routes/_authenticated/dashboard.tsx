import { createFileRoute } from "@tanstack/react-router"

import { AdminDashboardScreen } from "@/components/project/admin-dashboard"
import type { InboxPage } from "@/components/project/inbox-card"
import { MyDashboardScreen, type MyDashboardSearch } from "@/components/project/my-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { listNotificationPage } from "@/lib/api/notification"
import { loadAdminDashboardPage } from "@/lib/api/project/admin-dashboard"
import { loadMyDashboardPage } from "@/lib/api/project/checkins"
import { loadDailyCardPage } from "@/lib/api/project/daily-card"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { readTaskFilters } from "@/lib/project/task-filters"
import { pageTitleHead } from "@/lib/project/page-title"

const ID = /^[\w-]{1,36}$/

/** The Inbox card's first page, and where its Load more picks up. */
function inboxOf(page: Awaited<ReturnType<typeof listNotificationPage>>): InboxPage {
  return { notifications: page.notifications, nextCursor: page.next_cursor }
}

function readSearch(search: Record<string, unknown>): MyDashboardSearch {
  // Every task here is mine, so there is no Person filter.
  const { person: _person, ...filters } = readTaskFilters(search)
  const result: MyDashboardSearch = filters
  if (typeof search.task === "string" && ID.test(search.task)) result.task = search.task
  if (search.checkin === true || search.checkin === "true") result.checkin = true
  if (search.checkout === true || search.checkout === "true") result.checkout = true
  return result
}

/**
 * My dashboard. An employee's has their check-in, their tasks and their inbox;
 * the site admin's has their tasks across every team, their own list and the
 * admin cards (Admin task 03, 23 Oct 2026).
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: readSearch,
  // Opening a task or the check-in doesn't reload the page under it.
  loaderDeps: () => ({}),
  loader: async ({ parentMatchPromise }) => {
    const { user } = (await parentMatchPromise).loaderData ?? {}
    const inbox = listNotificationPage({ limit: 30 })
    if (user?.role === "admin") {
      const [admin, daily, firstPage] = await Promise.all([loadAdminDashboardPage(), loadDailyCardPage(), inbox])
      return { admin, daily, dashboard: null, inbox: inboxOf(firstPage) }
    }
    const [page, firstPage] = await Promise.all([loadMyDashboardPage(), inbox])
    // Someone on no team sees how to get started, with no card to load.
    const daily = page.dashboard ? await loadDailyCardPage() : null
    return { admin: null, daily, dashboard: page.dashboard, inbox: inboxOf(firstPage) }
  },
  head: ({ matches }) => pageTitleHead("My dashboard", matches),
  component: DashboardRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function DashboardRoute() {
  const { admin, daily, dashboard, inbox } = Route.useLoaderData()
  const search = Route.useSearch()
  if (admin) {
    // The admin's address has no check-in or check-out to open.
    const { checkin: _checkin, checkout: _checkout, ...adminSearch } = search
    return <AdminDashboardScreen dashboard={admin} daily={daily} inbox={inbox} search={adminSearch} />
  }
  return <MyDashboardScreen dashboard={dashboard} daily={daily} inbox={inbox} search={search} />
}
