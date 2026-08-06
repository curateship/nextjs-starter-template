import * as React from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"

import { TradeWorkspace } from "@/components/trade/trade-workspace"
import {
  getMarketsErrorMessage,
  loadLastMarket,
  loadMarketFavorites,
  loadMarkets,
  saveLastMarket,
} from "@/lib/api/markets"
import { loadRememberedChartView } from "@/lib/api/chart-view"
import type { ChartView } from "@/lib/trade/chart-view"

/**
 * `?market=<key>` is which market the middle panel shows — a full market key
 * (`hyperliquid:mainnet:BTC`), so the address stays honest about the exchange
 * and a link keeps meaning the same market when a second protocol exists.
 * Checked before use and dropped when it is not usable.
 */
type TradeSearch = { market?: string }

function readTradeSearch(search: Record<string, unknown>): TradeSearch {
  return {
    market:
      typeof search.market === "string" && search.market.length <= 120
        ? search.market
        : undefined,
  }
}

export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: readTradeSearch,
  loader: async () => {
    const [markets, favorites, lastMarket, chartView] = await Promise.all([
      // A dead exchange must not take the page down with it: the workspace
      // still opens, and the list explains itself and offers a retry.
      loadMarkets()
        .then((result) => ({ catalogs: result.catalogs, error: null }))
        .catch((error: unknown) => ({
          catalogs: [],
          error: getMarketsErrorMessage(error),
        })),
      // Losing the stars is cosmetic — an empty set just draws no stars.
      loadMarketFavorites().catch(() => ({ marketKeys: [] as string[] })),
      // Losing the memory only means a blank middle panel, never a broken page.
      loadLastMarket().catch(() => ({ marketKey: null as string | null })),
        // Read here rather than after the chart is up: arriving late would
        // frame the whole history first and jump to the remembered zoom a
        // beat later. Losing it only means the chart frames its own history.
        loadRememberedChartView().catch(() => ({
          chartView: null as ChartView | null,
        })),
      ])
    return {
      markets,
      favoriteKeys: favorites.marketKeys,
      lastMarketKey: lastMarket.marketKey,
      chartView: chartView.chartView,
    }
  },
  component: TradeRoute,
})

function TradeRoute() {
  const { markets, favoriteKeys, lastMarketKey, chartView } =
    Route.useLoaderData()
  const { market } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()

  // Stable on purpose: the workspace keys its live-feed effect on this, and
  // a fresh closure per render would resubscribe the feed on every market
  // click.
  const onRetryMarkets = React.useCallback(
    () => void router.invalidate(),
    [router]
  )

  // The address wins; the account's memory fills a bare visit. A remembered
  // market that no longer resolves shows the honest missing state — never a
  // swap to some market that does.
  const selectedKey = market ?? lastMarketKey ?? null

  // Remember whichever market is on screen, so the next bare visit reopens
  // it. Best-effort and ref-guarded: the same market is never saved twice in
  // a row, and a failed save only loses the memory, not the view.
  const lastSavedRef = React.useRef(lastMarketKey)
  React.useEffect(() => {
    if (!selectedKey || selectedKey === lastSavedRef.current) return
    lastSavedRef.current = selectedKey
    saveLastMarket(selectedKey).catch(() => {})
  }, [selectedKey])

  return (
    <TradeWorkspace
      catalogs={markets.catalogs}
      marketsError={markets.error}
      initialFavoriteKeys={favoriteKeys}
      initialChartView={chartView}
      selectedKey={selectedKey}
      onSelectMarket={(key) =>
        void navigate({
          search: (current) => ({ ...current, market: key }),
          replace: true,
        })
      }
      onRetryMarkets={onRetryMarkets}
    />
  )
}
