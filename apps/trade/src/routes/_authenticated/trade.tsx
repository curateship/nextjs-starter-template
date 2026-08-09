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
import { loadRememberedChartOptions } from "@/lib/api/chart-options"
import { loadRememberedChartView } from "@/lib/api/chart-view"
import { loadRememberedFolds } from "@/lib/api/card-folds"
import { loadIndicatorSettings } from "@/lib/api/indicators"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import type { ChartView } from "@/lib/trade/chart-view"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import {
  marketKeyOnNetwork,
  resolveTradeNetwork,
} from "@/lib/trade/trade-network"

/**
 * `?market=<key>` is which market the middle panel shows — a full market key
 * (`hyperliquid:mainnet:BTC`), so the address stays honest about the exchange
 * and a link keeps meaning the same market when a second protocol exists.
 * Checked before use and dropped when it is not usable.
 *
 * `?network=testnet` is the practice-network door when nothing is charted.
 * A market key already names its network, so with a market on screen the key
 * is the truth and this param only matters on a bare page — the one rule in
 * `resolveTradeNetwork`. There is no switch on screen any more (paper
 * wallets are the everyday practice path); the address, and any testnet
 * market's link, are how the door is opened when it is wanted.
 */
type TradeSearch = { market?: string; network?: "testnet" }

function readTradeSearch(search: Record<string, unknown>): TradeSearch {
  return {
    market:
      typeof search.market === "string" && search.market.length <= 120
        ? search.market
        : undefined,
    network: search.network === "testnet" ? "testnet" : undefined,
  }
}

export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: readTradeSearch,
  // The loader re-runs only when the RESOLVED network changes — clicking
  // between markets on one network keeps the catalog it already has.
  loaderDeps: ({ search }) => ({
    network: resolveTradeNetwork(search.market, search.network),
  }),
  loader: async ({ deps }) => {
    const [
      markets,
      favorites,
      lastMarket,
      chartView,
      chartOptions,
      indicators,
      cardFolds,
    ] =
      await Promise.all([
        // A dead exchange must not take the page down with it: the workspace
        // still opens, and the list explains itself and offers a retry.
        loadMarkets(deps.network)
          .then((result) => ({ catalogs: result.catalogs, error: null }))
          .catch((error: unknown) => ({
            catalogs: [],
            error: getMarketsErrorMessage(error),
          })),
        // Losing the stars is cosmetic — an empty set just draws no stars.
        loadMarketFavorites().catch(() => ({ marketKeys: [] as string[] })),
        // Losing the memory only means a blank middle panel, never a broken
        // page.
        loadLastMarket().catch(() => ({ marketKey: null as string | null })),
        // Read here rather than after the chart is up: arriving late would
        // frame the whole history first and jump to the remembered zoom a
        // beat later. Losing it only means the chart frames its own history.
        loadRememberedChartView().catch(() => ({
          chartView: null as ChartView | null,
        })),
        // The chart starts with the saved visibility choices. A failed read is
        // cosmetic, so the safe answer is the familiar all-visible chart.
        loadRememberedChartOptions().catch(() => ({
          options: DEFAULT_CHART_OPTIONS,
        })),
        // Read here too, so the first chart drawn already carries them rather
        // than painting bare candles and popping dashes on a beat later.
        // Losing them only means an unmarked chart, never a broken page.
        loadIndicatorSettings().catch(() => ({
          indicators: defaultIndicatorSettings(),
        })),
        // Read here rather than when a window opens, which would be too late:
        // its cards would draw open and then fold themselves a moment later,
        // in front of you. Losing it only means cards open as they always did.
        loadRememberedFolds().catch(() => ({ folds: {} })),
      ])
    return {
      markets,
      network: deps.network,
      favoriteKeys: favorites.marketKeys,
      lastMarketKey: lastMarket.marketKey,
      chartView: chartView.chartView,
      chartOptions: chartOptions.options,
      indicators: indicators.indicators,
      cardFolds: cardFolds.folds,
    }
  },
  component: TradeRoute,
})

function TradeRoute() {
  const {
    markets,
    network,
    favoriteKeys,
    lastMarketKey,
    chartView,
    chartOptions,
    indicators,
    cardFolds,
  } = Route.useLoaderData()
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
  // swap to some market that does. A memory from the OTHER network is left
  // alone rather than shown as missing: switching to testnet with a mainnet
  // market remembered should read as a bare testnet page, not a delisting.
  const remembered =
    lastMarketKey && marketKeyOnNetwork(lastMarketKey, network)
      ? lastMarketKey
      : null
  const selectedKey = market ?? remembered ?? null

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
      network={network}
      initialFavoriteKeys={favoriteKeys}
      initialChartView={chartView}
      initialChartOptions={chartOptions}
      initialIndicators={indicators}
      initialCardFolds={cardFolds}
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
