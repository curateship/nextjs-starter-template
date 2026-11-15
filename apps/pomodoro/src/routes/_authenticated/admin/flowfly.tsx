import { createFileRoute } from "@tanstack/react-router"

import { FlowflyDashboard } from "@/components/pomodoro/flowfly/flowfly-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getFlowflyErrorMessage, loadFlowflyCounts } from "@/lib/api/pomodoro/flowfly"
import { loadFlowflyTab } from "@/lib/pomodoro/flowfly-load"
import { flowflyTabOf, readFlowflySearch } from "@/lib/pomodoro/flowfly-search"

/**
 * Flowfly: every Pomodoro admin page as one three-panel dashboard (Tyler,
 * 13 Nov 2026: "consolidate and combine all of the app's dashboard into one
 * 3 panel dashboard", then "take all seven"). Seven sections on the left
 * page's Dashboards block, each section's lists as tabs in one header.
 * `src/lib/pomodoro/flowfly-search.ts` says what each address key means;
 * `workspace/docs/admin-dashboard.md` says what each panel holds.
 */
export const Route = createFileRoute("/_authenticated/admin/flowfly")({
  validateSearch: readFlowflySearch,
  // The section and tab only, and a list's own tab where it changes what the
  // rows are (Bans, Blocks, Leaderboard). Everything else a list asks again in
  // place, so typing never reads the whole tab again.
  loaderDeps: ({ search }) => ({
    tab: flowflyTabOf(search),
    inner: typeof search.tab === "string" ? search.tab : undefined,
  }),
  // Read again only when the tab changes or a list asks (`router.invalidate()`),
  // never because a row was opened. Kept for no time once the dashboard is
  // left, so coming back always reads fresh.
  shouldReload: false,
  gcTime: 0,
  loader: async ({ deps, location }) => {
    // The router types a loader's `location.search` as empty whatever the
    // schema says, so it is read back through the same checks.
    const search = readFlowflySearch(location.search as Record<string, unknown>)
    const [counts, loaded] = await Promise.all([
      loadFlowflyCounts(),
      deps.tab ? loadFlowflyTab(deps.tab, search) : Promise.resolve(null),
    ])
    return { counts, loaded }
  },
  component: FlowflyRoute,
  errorComponent: routeErrorComponent(getFlowflyErrorMessage),
})

function FlowflyRoute() {
  const { counts, loaded } = Route.useLoaderData()
  return <FlowflyDashboard search={Route.useSearch()} counts={counts} loaded={loaded} />
}
