import { createFileRoute } from "@tanstack/react-router"

import { marketTitleFromMatches, useMarketPageTitle } from "@/app/page-title"
import { BacktestRunPage } from "@/components/backtest/backtest-run-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getBacktestErrorMessage, loadBacktest } from "@/lib/api/trade/backtests"

/**
 * One run in full.
 *
 * `?run=<market key>` is which coin's chart is open under the table — a full
 * market key, so the address stays honest about the exchange the way the
 * trading screen's does. Anything else is treated as no coin at all.
 */
type RunSearch = { run?: string }

function readRunSearch(search: Record<string, unknown>): RunSearch {
  return {
    run:
      typeof search.run === "string" && search.run.length <= 120
        ? search.run
        : undefined,
  }
}

export const Route = createFileRoute("/_authenticated/backtests_/$groupId")({
  validateSearch: readRunSearch,
  gcTime: 0,
  loader: ({ params }) => loadBacktest(params.groupId),
  head: ({ matches }) => ({
    meta: [{ title: marketTitleFromMatches(matches, "run", "Backtest run") }],
  }),
  component: BacktestRunRoute,
  errorComponent: routeErrorComponent(getBacktestErrorMessage),
})

function BacktestRunRoute() {
  const data = Route.useLoaderData()
  const { run } = Route.useSearch()

  // A coin named in the address that this run never tested is treated as no
  // coin at all, rather than a chart of nothing.
  const openCoin =
    run && data.coins.some((coin) => coin.marketKey === run) ? run : null
  useMarketPageTitle(openCoin, "Backtest run")

  return (
    <BacktestRunPage run={data.run} coins={data.coins} openCoin={openCoin} />
  )
}
