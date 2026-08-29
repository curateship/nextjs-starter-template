import * as React from "react"
import {
  type SearchMiddleware,
  stripSearchParams,
  useLoaderData,
  useNavigate,
  useSearch,
} from "@tanstack/react-router"

import { marketTitleFromMatches, useMarketPageTitle } from "@/app/page-title"
import { TradeWorkspace } from "@/components/trade/trade-workspace"
import { useDashboardMarkets } from "@/components/trade/use-dashboard-markets"
import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { loadDashboardBootstrap } from "@/lib/api/trade/dashboard"
import { saveLastMarket } from "@/lib/api/trade/markets"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import { seedSmartPrefs } from "@/lib/trade/smart-prefs-cache"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import { DEFAULT_MARKET_PANEL_ROWS } from "@/lib/trade/market-folders"
import { RUNNING_BOTS_READ_ERROR } from "@/lib/trade/running-bots"
import { dashboardBootstrapVersion } from "@/lib/trade/dashboard-bootstrap-cache"
import { seedTradeSounds } from "@/lib/trade/trade-sounds"
import {
  marketKeyOnDashboard,
  readMarketSearch,
  readTradeSearch,
  resolveTradeNetwork,
  type TradeSearch,
} from "@/lib/trade/trade-network"

/**
 * The exchange dashboard page, once.
 *
 * Every exchange gets a page of exactly this shape — same panels, same
 * loader, its own address — and market lists from different exchanges are
 * never combined into one list. The pages used to be the same file copied
 * out per exchange with one constant changed; this is that file, and each
 * route now hands it the two facts that differ: which protocol, and whether
 * the exchange still runs a practice network.
 *
 * The protocol is held as DATA and handed to the loader; nothing here ever
 * asks "is this Hyperliquid?", which is the comparison the protocol fence
 * exists to prevent. The search params are documented in
 * `@/lib/trade/trade-network`.
 */
type ExchangePage = {
  protocol: ProtocolId
  /** The name in the tab title — "Hyperliquid", "KuCoin". */
  label: string
}

/**
 * One server call for everything the page needs — see `@/lib/api/trade/dashboard`.
 * A dead exchange is answered inside it, with an empty list and a message. A
 * server that does not answer at all still opens the workspace: the list
 * explains itself and offers a retry, and every preference falls back to its
 * default.
 */
function exchangeLoader(protocol: ProtocolId) {
  return async ({ deps }: { deps: { network: NetworkId } }) => {
    const boot = await loadDashboardBootstrap(protocol, deps.network).catch(
      () => ({
        markets: {
          catalogs: [],
          error:
            "The server did not answer. Nothing is wrong on your side — try again in a moment.",
        },
        folders: [],
        panelRows: DEFAULT_MARKET_PANEL_ROWS,
        lastMarketKey: null,
        chartView: null,
        chartOptions: DEFAULT_CHART_OPTIONS,
        indicators: defaultIndicatorSettings(),
        cardFolds: {},
        quickOrder: DEFAULT_QUICK_ORDER,
        smartDca: null,
        smartGrid: null,
        runningBots: {
          rows: [],
          error: RUNNING_BOTS_READ_ERROR,
        },
        initialChart: null,
        drawings: { marketKey: null, rows: [], error: null },
        tradeSounds: {
          enabled: false,
          events: [],
          cursor: { afterAt: Date.now(), afterId: "" },
          error: "Trade sounds could not be read.",
        },
        wallets: {
          rows: [],
          summaries: [],
          lastWalletIds: {},
          error: "The wallets could not be loaded.",
        },
      })
    )
    return { ...boot, network: deps.network }
  }
}

type ExchangeLoaderData = Awaited<ReturnType<ReturnType<typeof exchangeLoader>>>

/**
 * Everything the routes share regardless of network handling: the one-minute
 * staleTime (a market click, or coming back to this tab inside that window,
 * paints at once instead of asking the server again — saving the volume
 * cutoff in Settings invalidates it), the loader, the tab title, and the
 * page itself.
 */
function sharedOptions({ protocol, label }: ExchangePage) {
  return {
    staleTime: 60_000,
    loader: exchangeLoader(protocol),
    head: ({
      matches,
    }: {
      matches: Parameters<typeof marketTitleFromMatches>[0]
    }) => ({
      meta: [{ title: marketTitleFromMatches(matches, "market", label) }],
    }),
    component: function ExchangeRoute() {
      return <ExchangeDashboard protocol={protocol} label={label} />
    },
  }
}

/**
 * Route options for an exchange with a practice network. `?network=testnet`
 * is honoured, and the loader's inputs are the RESOLVED network alone —
 * clicking between markets on one network does not change them.
 */
export function practiceExchangeRoute(page: ExchangePage) {
  return {
    validateSearch: readTradeSearch,
    loaderDeps: ({ search }: { search: TradeSearch }) => ({
      network: resolveTradeNetwork(search.market, search.network),
      bootstrapVersion: dashboardBootstrapVersion(),
    }),
    ...sharedOptions(page),
  }
}

/**
 * Route options for a mainnet-only exchange. The page has no `?network`
 * param at all: a pasted `?network=…` is removed from the URL itself, not
 * just left unread — the address stays the one honest description of a page
 * that has exactly one network.
 */
export function mainnetExchangeRoute(page: ExchangePage) {
  return {
    validateSearch: readMarketSearch,
    search: {
      // Typed loosely on purpose: each route's full search type also carries
      // params inherited from parent routes, which this shared factory
      // cannot name. The middleware itself only ever touches `network`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      middlewares: [stripSearchParams(["network"]) as SearchMiddleware<any>],
    },
    loaderDeps: () => ({
      network: "mainnet" as const,
      bootstrapVersion: dashboardBootstrapVersion(),
    }),
    ...sharedOptions(page),
  }
}

function ExchangeDashboard({ protocol, label }: ExchangePage) {
  // Non-strict, because this one component serves every exchange route. The
  // shapes are guaranteed by the route options built above, which are the
  // only ones that render it.
  const {
    markets,
    network,
    folders,
    panelRows,
    lastMarketKey,
    chartView,
    chartOptions,
    indicators,
    cardFolds,
    quickOrder,
    smartDca,
    smartGrid,
    runningBots,
    initialChart,
    drawings,
    tradeSounds,
    wallets,
  } = useLoaderData({ strict: false }) as ExchangeLoaderData
  // The smart-order windows' saved settings arrived with the page; hand them
  // to the browser-side copy so the first right-click opens on them with
  // nothing left to fetch. Fills empty slots only — a placement made since
  // the loader's answer was cached must not be overwritten by it.
  seedSmartPrefs(smartDca, smartGrid)
  seedTradeSounds(tradeSounds)
  const { market } = useSearch({ strict: false }) as TradeSearch
  const navigate = useNavigate()
  // A retry fetches the market list alone — never the whole loader. Stable
  // on purpose: the workspace keys its live-feed effect on it, and a fresh
  // closure per render would resubscribe the feed on every market click.
  const { markets: shownMarkets, retry: onRetryMarkets } = useDashboardMarkets(
    markets,
    protocol,
    network
  )

  // The address wins; the account's memory fills a bare visit. A remembered
  // market that no longer resolves shows the honest missing state — never a
  // swap to some market that does. A memory from another network — or from
  // another exchange's dashboard, since the memory is shared across all of
  // them — is left alone rather than shown as missing: it should read as a
  // bare page here, not a delisting.
  const remembered =
    lastMarketKey && marketKeyOnDashboard(lastMarketKey, protocol, network)
      ? lastMarketKey
      : null
  const selectedKey = market ?? remembered ?? null
  useMarketPageTitle(selectedKey, label)

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
      protocol={protocol}
      catalogs={shownMarkets.catalogs}
      marketsError={shownMarkets.error}
      network={network}
      initialFolders={folders}
      initialPanelRows={panelRows}
      initialChartView={chartView}
      initialChart={initialChart}
      initialDrawings={drawings}
      initialChartOptions={chartOptions}
      initialIndicators={indicators}
      initialCardFolds={cardFolds}
      initialQuickOrder={quickOrder}
      initialRunningBots={runningBots}
      initialWallets={wallets}
      selectedKey={selectedKey}
      onSelectMarket={(key) =>
        void navigate({
          to: ".",
          search: (current) => ({ ...current, market: key }),
        })
      }
      onRetryMarkets={onRetryMarkets}
    />
  )
}
