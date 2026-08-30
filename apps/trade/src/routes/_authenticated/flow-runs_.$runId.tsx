import { createFileRoute } from "@tanstack/react-router"

import { marketTitleFromMatches, useMarketPageTitle } from "@/app/page-title"
import { FlowRunPage } from "@/components/flow-run/flow-run-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadRememberedChartView } from "@/lib/api/trade/chart-view"
import { getFlowRunErrorMessage, loadFlowRun } from "@/lib/api/trade/flow-runs"
import { emptyTradePanelLayouts } from "@/lib/trade/panel-layout"

/**
 * One run in full.
 *
 * `?coin=<market key>` is which coin's chart is open — a full market key, so
 * the address stays honest about which exchange it means, the same way the
 * trading screen's does. Anything else is treated as no coin at all.
 *
 * Deliberately `coin` rather than the backtest's `run`: on this page "run"
 * already means the thing in the path, and one word for two things in one
 * address is how a link ends up opening the wrong screen.
 */
type CoinSearch = { coin?: string }

function readCoinSearch(search: Record<string, unknown>): CoinSearch {
  return {
    coin:
      typeof search.coin === "string" && search.coin.length <= 120
        ? search.coin
        : undefined,
  }
}

export const Route = createFileRoute("/_authenticated/flow-runs_/$runId")({
  validateSearch: readCoinSearch,
  gcTime: 0,
  loader: async ({ params }) => {
    const [report, prefs] = await Promise.all([
      loadFlowRun(params.runId),
      loadRememberedChartView().catch(() => null),
    ])
    return {
      report,
      // The same zoom and up-and-down squash the trading chart is remembered at.
      // Without it this chart framed itself its own way, and a ladder whose rungs
      // sit well under today's price fell off the bottom here while showing fine
      // on the trade screen — two charts of one coin disagreeing about where its
      // buy levels are.
      chartView: prefs?.chartView ?? null,
      panelLayouts: prefs?.panelLayouts ?? emptyTradePanelLayouts(),
    }
  },
  head: ({ matches }) => ({
    meta: [{ title: marketTitleFromMatches(matches, "coin", "Flow run") }],
  }),
  component: FlowRunRoute,
  errorComponent: routeErrorComponent(getFlowRunErrorMessage),
})

function FlowRunRoute() {
  const { report, chartView, panelLayouts } = Route.useLoaderData()
  const { coin } = Route.useSearch()

  // A coin named in the address that this run never watched is treated as no
  // coin at all, rather than a chart of nothing.
  const openCoin =
    coin && report.coins.some((one) => one.marketKey === coin) ? coin : null
  useMarketPageTitle(openCoin, "Flow run")

  return (
    <FlowRunPage
      initial={report}
      openCoin={openCoin}
      chartView={chartView}
      initialPanelLayouts={panelLayouts}
    />
  )
}
