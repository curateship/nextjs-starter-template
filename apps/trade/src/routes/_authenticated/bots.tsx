import { createFileRoute, getRouteApi, Navigate, redirect } from "@tanstack/react-router"

import { marketTitleFromMatches, useMarketPageTitle } from "@/app/page-title"
import { BotsDashboard, type BotsLoaded } from "@/components/bots/bots-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadBacktest, loadBacktests } from "@/lib/api/trade/backtests"
import { getBotsErrorMessage, loadBotsOverviewPage } from "@/lib/api/trade/bots"
import { loadRememberedChartView } from "@/lib/api/trade/chart-view"
import { loadFlowRun, loadFlowRuns } from "@/lib/api/trade/flow-runs"
import { getRecipe, loadRecipesPage } from "@/lib/api/trade/recipes"
import { botsViewOf, readBotsSearch, type BotsView } from "@/lib/bots/bots-search"
import { emptyTradePanelLayouts } from "@/lib/trade/panel-layout"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * The Bots dashboard: Overview, Recipes, Backtests and Bots in one three-panel
 * dashboard (Tyler, 9 Nov 2026), in place of `/admin/recipes`, `/backtests`,
 * `/flow-runs` and their record pages, whose addresses are gone rather than
 * forwarded. `src/lib/bots/bots-search.ts` says what each address key means.
 *
 * Admins only ("Admins only"): a backtest and a bot both start from a recipe,
 * and only an admin can make one. Every recipe call checks it on the server
 * too; the backtest and bot reads stay the person's own.
 */
export const Route = createFileRoute("/_authenticated/bots")({
  validateSearch: readBotsSearch,
  // The section, its filter, and the record opened in the middle. Picking a
  // line only moves `?open=`, which reads nothing; opening it reads the record.
  loaderDeps: ({ search }) => ({
    view: botsViewOf(search),
    archived: search.archived === true,
    // A picked backtest or recipe is read too: its cards show on the right.
    opened:
      search.full || botsViewOf(search) === "backtests" || botsViewOf(search) === "recipes"
        ? search.open
        : undefined,
  }),
  // Kept for no time once the dashboard is left, so coming back reads fresh.
  gcTime: 0,
  loader: async ({ deps, parentMatchPromise }) => {
    const parent = await parentMatchPromise
    if (parent.loaderData?.user.role !== "admin") throw redirect({ to: "/home", replace: true })
    return loadBots(deps)
  },
  head: ({ matches }) => ({ meta: [{ title: marketTitleFromMatches(matches, "coin", "Bots") }] }),
  component: BotsRoute,
  errorComponent: routeErrorComponent(getBotsErrorMessage),
})

async function loadBots({
  view,
  archived,
  opened,
}: {
  view: BotsView
  archived: boolean
  opened: string | undefined
}): Promise<BotsLoaded> {
  if (view === "recipes") {
    const [page, recipe] = await Promise.all([loadRecipesPage(), opened ? getRecipe(opened) : null])
    return { view, recipes: page.recipes, opened: recipe }
  }
  if (view === "backtests") {
    const [list, run, prefs] = await Promise.all([
      loadBacktests({ includeArchived: archived }),
      opened ? loadBacktest(opened) : null,
      // A coin's chart opens at the Trade chart's remembered view.
      opened ? loadRememberedChartView().catch(() => null) : null,
    ])
    return { view, runs: list.runs, opened: run ? { ...run, chartView: prefs?.chartView ?? null } : null }
  }
  if (view === "bots") {
    const [runs, report, prefs] = await Promise.all([
      loadFlowRuns(),
      opened ? loadFlowRun(opened) : null,
      // The same zoom the trading chart is remembered at, so a ladder's rungs sit where they do there.
      opened ? loadRememberedChartView().catch(() => null) : null,
    ])
    return {
      view,
      runs,
      opened: report
        ? {
            report,
            chartView: prefs?.chartView ?? null,
            panelLayouts: prefs?.panelLayouts ?? emptyTradePanelLayouts(),
          }
        : null,
    }
  }
  const overview = await loadBotsOverviewPage()
  return { view: "overview", bots: overview.bots, layout: overview.layout }
}

function BotsRoute() {
  const { user } = authenticatedRoute.useLoaderData()
  const search = Route.useSearch()
  const loaded = Route.useLoaderData()
  // The tab names the coin on an opened run's chart, and the dashboard otherwise.
  useMarketPageTitle(search.full ? (search.coin ?? null) : null, "Bots")
  if (user.role !== "admin") return <Navigate to="/home" replace />
  return <BotsDashboard loaded={loaded} search={search} />
}
