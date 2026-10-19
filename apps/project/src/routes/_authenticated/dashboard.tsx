import { createFileRoute, redirect } from "@tanstack/react-router"

import { MyDashboardScreen, type MyDashboardSearch } from "@/components/project/my-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { listNotificationPage } from "@/lib/api/notification"
import { loadMyDashboardPage } from "@/lib/api/project/checkins"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { readTaskFilters } from "@/lib/project/task-filters"
import { pageTitleHead } from "@/lib/project/page-title"

const ID = /^[\w-]{1,36}$/

function readSearch(search: Record<string, unknown>): MyDashboardSearch {
  // Every task here is mine, so there is no Person filter.
  const { person: _person, ...filters } = readTaskFilters(search)
  const result: MyDashboardSearch = filters
  if (typeof search.task === "string" && ID.test(search.task)) result.task = search.task
  if (search.checkin === true || search.checkin === "true") result.checkin = true
  if (search.checkout === true || search.checkout === "true") result.checkout = true
  return result
}

/** My dashboard: me and today's check-in, my tasks, my inbox. Employees only. */
export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: readSearch,
  // Opening a task or the check-in doesn't reload the page under it.
  loaderDeps: () => ({}),
  loader: async ({ parentMatchPromise }) => {
    // The site admin oversees and has no tasks or check-in (Tyler, 16 Oct
    // 2026: "What tasks? if i only overseeas the team, why would I get
    // tasks?"), so My dashboard sends them to Teams.
    const { user } = (await parentMatchPromise).loaderData ?? {}
    if (user?.role === "admin") throw redirect({ to: "/teams", replace: true })
    const [page, inbox] = await Promise.all([
      loadMyDashboardPage(),
      listNotificationPage({ limit: 30 }),
    ])
    return { ...page, notifications: inbox.notifications }
  },
  head: ({ matches }) => pageTitleHead("My dashboard", matches),
  component: DashboardRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function DashboardRoute() {
  const { dashboard, notifications } = Route.useLoaderData()
  return (
    <MyDashboardScreen
      dashboard={dashboard}
      notifications={notifications}
      search={Route.useSearch()}
    />
  )
}
