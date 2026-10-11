import { createFileRoute } from "@tanstack/react-router"

import { AdminSimulatedDashboard } from "@/components/pomodoro/admin-simulated-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getSimulatedErrorMessage, loadSimulatedWatchPage } from "@/lib/api/pomodoro/admin-simulated"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { SIMULATED_SORT_COLUMNS, SIMULATED_TABS, readMemberSearch } from "@/lib/pomodoro/admin-lists"

type SimulatedSearch = {
  /** The member window open over the page. */
  member?: string
  tab?: (typeof SIMULATED_TABS)[number]
  q?: string
  sort?: (typeof SIMULATED_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
  /** The Lines table's own page. */
  lines?: number
}

/** The page's own state, so Back returns the exact page you left. */
function readSimulatedSearch(search: Record<string, unknown>): SimulatedSearch {
  return {
    ...readMemberSearch(search),
    tab: readOneOf(search.tab, SIMULATED_TABS),
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, SIMULATED_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    lines: readPage(search.lines),
  }
}

/**
 * The made-up members' watch page (live activity task 05). See "Your
 * controls" in `workspace/docs/made-up-members.md`.
 */
export const Route = createFileRoute("/_authenticated/admin/pomodoro-simulated")({
  validateSearch: readSimulatedSearch,
  // No `loaderDeps`: the address seeds the first render and each table
  // refetches in place.
  loader: ({ location }) => {
    const search = readSimulatedSearch(location.search as Record<string, unknown>)
    return loadSimulatedWatchPage({
      tab: search.tab ?? "today",
      search: search.q ?? "",
      sort: search.sort ?? "hours",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
      linesPage: search.lines ?? 1,
    })
  },
  component: AdminPomodoroSimulatedRoute,
  errorComponent: routeErrorComponent(getSimulatedErrorMessage),
})

function AdminPomodoroSimulatedRoute() {
  return <AdminSimulatedDashboard initial={Route.useLoaderData()} />
}
