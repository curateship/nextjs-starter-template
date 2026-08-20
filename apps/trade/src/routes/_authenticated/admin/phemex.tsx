import * as React from "react"
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router"

import { TradeWorkspace } from "@/components/trade/trade-workspace"
import type { ProtocolId } from "@/lib/protocols/contracts"
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
import { loadQuickOrderPrefs } from "@/lib/api/quick-order"
import { loadIndicatorSettings } from "@/lib/api/indicators"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import type { ChartView } from "@/lib/trade/chart-view"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import {
  marketKeyOnDashboard,
  readMarketSearch,
} from "@/lib/trade/trade-network"

/**
 * The Phemex dashboard — the same page as every other exchange's, at its own
 * address, showing only Phemex's markets. The one thing that makes it
 * Phemex's is the constant below, held as DATA and handed to `loadMarkets`;
 * nothing here ever compares a protocol id. The search params are documented
 * in `@/lib/trade/trade-network`.
 *
 * Mainnet only: Phemex's practice network is not carried (decided 19 Aug
 * 2026), so this page has no `?network` param at all — `readMarketSearch`
 * knows only `?market`, and anything else typed into the address is dropped
 * from it rather than accepted and overridden.
 */
const PROTOCOL: ProtocolId = "phemex"

export const Route = createFileRoute("/_authenticated/admin/phemex")({
  validateSearch: readMarketSearch,
  search: {
    // A pasted `?network=…` is removed from the URL itself, not just left
    // unread — the address stays the one honest description of a page that
    // has exactly one network.
    middlewares: [stripSearchParams(["network"])],
  },
  loaderDeps: () => ({
    network: "mainnet" as const,
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
      quickOrder,
    ] =
      await Promise.all([
        // A dead exchange must not take the page down with it: the workspace
        // still opens, and the list explains itself and offers a retry.
        loadMarkets(PROTOCOL, deps.network)
          .then((result) => ({ catalogs: result.catalogs, error: null }))
          .catch((error: unknown) => ({
            catalogs: [],
            error: getMarketsErrorMessage(error),
          })),
        // Losing the stars is cosmetic — an empty set just draws no stars.
        loadMarketFavorites().catch(() => ({ marketKeys: [] as string[] })),
        // Losing the memory only means a blank middle panel, never a broken
        // page.
        loadLastMarket(PROTOCOL).catch(() => ({
          marketKey: null as string | null,
        })),
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
        // The right-click order window's last-used sizing, read here for the
        // same reason: it opens on a click, and a window that filled itself in
        // after it was already on screen would be no use to anybody typing.
        // Losing it only means an empty size box.
        loadQuickOrderPrefs().catch(() => ({ prefs: DEFAULT_QUICK_ORDER })),
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
      quickOrder: quickOrder.prefs,
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
    quickOrder,
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
  // swap to some market that does. A memory from another network — or from
  // another exchange's dashboard, since the memory is shared across all of
  // them — is left alone rather than shown as missing: it should read as a
  // bare page here, not a delisting.
  const remembered =
    lastMarketKey && marketKeyOnDashboard(lastMarketKey, PROTOCOL, network)
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
      protocol={PROTOCOL}
      catalogs={markets.catalogs}
      marketsError={markets.error}
      network={network}
      initialFavoriteKeys={favoriteKeys}
      initialChartView={chartView}
      initialChartOptions={chartOptions}
      initialIndicators={indicators}
      initialCardFolds={cardFolds}
      initialQuickOrder={quickOrder}
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
