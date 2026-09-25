import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { BacktestsListPage } from "@/components/backtest/backtests-list-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getBacktestErrorMessage, loadBacktests } from "@/lib/api/trade/backtests"

/**
 * Every backtest this account has run.
 *
 * A page of its own rather than a tab on the trading screen: a run outlives the
 * flow that made it, and comparing last week's to today's is the whole point of
 * keeping them.
 */
export const Route = createFileRoute("/_authenticated/backtests")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Backtests") }],
  }),
  // The page keeps a copy of the loader's answer so it can refresh a live run
  // without a full navigation. Dropping it on close means coming back never
  // draws an older list while the fresh answer is on its way.
  gcTime: 0,
  loader: () => loadBacktests({}),
  component: BacktestsRoute,
  errorComponent: routeErrorComponent(getBacktestErrorMessage),
})

function BacktestsRoute() {
  useTradePageTitle("Backtests")
  return <BacktestsListPage initial={Route.useLoaderData().runs} />
}
