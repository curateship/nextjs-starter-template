import { createFileRoute } from "@tanstack/react-router"

import { MyDashboardScreen, type MyDashboardSearch } from "@/components/project/my-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { listNotificationPage } from "@/lib/api/notification"
import { loadMyDashboardPage } from "@/lib/api/project/checkins"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { readTaskFilters } from "@/lib/project/task-filters"

const ID = /^[\w-]{1,36}$/

function readSearch(search: Record<string, unknown>): MyDashboardSearch {
  // Every task here is mine, so there is no Person filter.
  const { person: _person, ...filters } = readTaskFilters(search)
  const result: MyDashboardSearch = filters
  if (typeof search.task === "string" && ID.test(search.task)) result.task = search.task
  if (search.checkin === true || search.checkin === "true") result.checkin = true
  return result
}

/** My dashboard: me and today's check-in, my tasks, my inbox. */
export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: readSearch,
  // Opening a task or the check-in doesn't reload the page under it.
  loaderDeps: () => ({}),
  loader: async () => {
    const [page, inbox] = await Promise.all([
      loadMyDashboardPage(),
      listNotificationPage({ limit: 30 }),
    ])
    return { ...page, notifications: inbox.notifications }
  },
  component: DashboardRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function DashboardRoute() {
  const { dashboard, invites, notifications } = Route.useLoaderData()
  return (
    <MyDashboardScreen
      dashboard={dashboard}
      invites={invites}
      notifications={notifications}
      search={Route.useSearch()}
    />
  )
}
