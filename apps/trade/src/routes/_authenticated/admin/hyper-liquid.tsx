import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"

import { marketTitleFromMatches, useMarketPageTitle } from "@/app/page-title"
import { TradeWorkspace } from "@/components/trade/trade-workspace"
import { useDashboardMarkets } from "@/components/trade/use-dashboard-markets"
import type { ProtocolId } from "@/lib/protocols/contracts"
import { loadDashboardBootstrap } from "@/lib/api/dashboard"
import { saveLastMarket } from "@/lib/api/markets"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import {
  marketKeyOnDashboard,
  readTradeSearch,
  resolveTradeNetwork,
} from "@/lib/trade/trade-network"

/**
 * The Hyperliquid dashboard. Every exchange gets a page of exactly this
 * shape — same panels, same loader, its own address — and market lists from
 * different exchanges are never combined into one list.
 *
 * The one thing that makes this page Hyperliquid's is the constant below. It
 * is held as DATA and handed to `loadMarkets`; nothing here ever asks "is
 * this Hyperliquid?", which is the comparison the protocol fence exists to
 * prevent. The search params are documented in `@/lib/trade/trade-network`.
 */
const PROTOCOL: ProtocolId = "hyperliquid"

export const Route = createFileRoute("/_authenticated/admin/hyper-liquid")({
  validateSearch: readTradeSearch,
  // The loader's inputs are the RESOLVED network alone — clicking between
  // markets on one network does not change them.
  loaderDeps: ({ search }) => ({
    network: resolveTradeNetwork(search.market, search.network),
  }),
  // The page's data is good for a minute: a market click, or coming back to
  // this tab inside that window, paints at once instead of asking the server
  // again. Saving the volume cutoff in Settings invalidates it, so a new
  // cutoff shows on the next visit regardless.
  staleTime: 60_000,
  loader: async ({ deps }) => {
    // One server call for everything the page needs — see
    // `@/lib/api/dashboard`. A dead exchange is answered inside it, with an
    // empty list and a message. A server that does not answer at all still
    // opens the workspace: the list explains itself and offers a retry, and
    // every preference falls back to its default.
    const boot = await loadDashboardBootstrap(PROTOCOL, deps.network).catch(
      () => ({
        markets: {
          catalogs: [],
          error:
            "The server did not answer. Nothing is wrong on your side — try again in a moment.",
        },
        folders: [],
        lastMarketKey: null,
        chartView: null,
        chartOptions: DEFAULT_CHART_OPTIONS,
        indicators: defaultIndicatorSettings(),
        cardFolds: {},
        quickOrder: DEFAULT_QUICK_ORDER,
      })
    )
    return { ...boot, network: deps.network }
  },
  head: ({ matches }) => ({
    meta: [{ title: marketTitleFromMatches(matches, "market", "Hyperliquid") }],
  }),
  component: TradeRoute,
})

function TradeRoute() {
  const {
    markets,
    network,
    folders,
    lastMarketKey,
    chartView,
    chartOptions,
    indicators,
    cardFolds,
    quickOrder,
  } = Route.useLoaderData()
  const { market } = Route.useSearch()
  const navigate = Route.useNavigate()
  // A retry fetches the market list alone — never the whole loader. Stable
  // on purpose: the workspace keys its live-feed effect on it, and a fresh
  // closure per render would resubscribe the feed on every market click.
  const { markets: shownMarkets, retry: onRetryMarkets } = useDashboardMarkets(
    markets,
    PROTOCOL,
    network
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
  useMarketPageTitle(selectedKey, "Hyperliquid")

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
      catalogs={shownMarkets.catalogs}
      marketsError={shownMarkets.error}
      network={network}
      initialFolders={folders}
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
