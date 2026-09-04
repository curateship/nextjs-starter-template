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
import {
  useDashboardMarkets,
  type DashboardMarkets,
} from "@/components/trade/use-dashboard-markets"
import {
  marketChartHref,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  loadDashboardCore,
  loadDashboardExchange,
  type DashboardBootstrap,
  type DashboardCore,
  type DashboardExchange,
} from "@/lib/api/trade/dashboard"
import { saveLastMarket, searchMarkets } from "@/lib/api/trade/markets"
import { DEFAULT_CHART_INTERVAL } from "@/lib/trade/chart-interval"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import { emptyTradePanelLayouts } from "@/lib/trade/panel-layout"
import { seedSmartPrefs } from "@/lib/trade/smart-prefs-cache"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import { DEFAULT_MARKET_PANEL_ROWS } from "@/lib/trade/market-folders"
import { RUNNING_BOTS_READ_ERROR } from "@/lib/trade/running-bots"
import { dashboardBootstrapVersion } from "@/lib/trade/dashboard-bootstrap-cache"
import { seedTradeSounds } from "@/lib/trade/trade-sounds"
import { useStreamed } from "@/lib/trade/use-streamed"
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

/** What the exchange half answers when the server never answered at all. */
function exchangeUnanswered(): DashboardExchange {
  return {
    markets: {
      catalogs: [],
      error:
        "The server did not answer. Nothing is wrong on your side — try again in a moment.",
    },
    initialChart: null,
    wallets: {
      rows: [],
      summaries: [],
      error: "The wallets could not be loaded.",
    },
  }
}

/** Every preference at its default, for a server that never answered. */
function coreUnanswered(): DashboardCore {
  return {
    folders: [],
    panelRows: DEFAULT_MARKET_PANEL_ROWS,
    lastMarketKey: null,
    chartView: null,
    chartOptions: DEFAULT_CHART_OPTIONS,
    indicators: defaultIndicatorSettings(),
    cardFolds: {},
    quickOrder: DEFAULT_QUICK_ORDER,
    panelLayouts: emptyTradePanelLayouts(),
    smartDca: null,
    smartGrid: null,
    runningBots: {
      rows: [],
      error: RUNNING_BOTS_READ_ERROR,
    },
    drawings: { marketKey: null, rows: [], error: null },
    priceAlerts: { rows: [], error: null },
    tradeSounds: {
      settings: { fillsAndStops: false, alerts: false },
      events: [],
      cursor: { afterAt: Date.now(), afterId: "" },
      error: "Trade sounds could not be read.",
    },
    lastWalletIds: {},
  }
}

/**
 * Two server calls that leave together — see `@/lib/api/trade/dashboard`.
 *
 * Only the database half is awaited, so the document goes out without
 * waiting for the exchange. The exchange half rides along as a promise and
 * streams its answer into the painted page. A dead exchange is answered
 * inside that half, with an empty list and a message. A server that does not
 * answer at all still opens the workspace: the list explains itself and
 * offers a retry, and every preference falls back to its default.
 */
function exchangeLoader(protocol: ProtocolId) {
  return async ({ deps }: { deps: { network: NetworkId } }) => {
    const exchange = loadDashboardExchange(protocol, deps.network).catch(
      exchangeUnanswered
    )
    const core = await loadDashboardCore(protocol, deps.network).catch(
      coreUnanswered
    )
    return { ...core, network: deps.network, exchange }
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

/** The market list before the exchange half of the opening answer lands. */
const PENDING_MARKETS: DashboardMarkets = {
  catalogs: [],
  error: null,
  pending: true,
}

function ExchangeDashboard({ protocol, label }: ExchangePage) {
  // Non-strict, because this one component serves every exchange route. The
  // shapes are guaranteed by the route options built above, which are the
  // only ones that render it.
  const { exchange, network, lastWalletIds, ...core } = useLoaderData({
    strict: false,
  }) as ExchangeLoaderData
  // The exchange-facing half of the opening answer, null until it streams
  // in. Everything below composes the two halves so the workspace paints its
  // saved arrangement first and fills the exchange's answers into it.
  const arrived = useStreamed(exchange)
  // The smart-order windows' saved settings arrived with the page; hand them
  // to the browser-side copy so the first right-click opens on them with
  // nothing left to fetch. Fills empty slots only — a placement made since
  // the loader's answer was cached must not be overwritten by it.
  seedSmartPrefs(core.smartDca, core.smartGrid)
  seedTradeSounds(core.tradeSounds)
  const { market } = useSearch({ strict: false }) as TradeSearch
  const navigate = useNavigate()

  const markets = React.useMemo<DashboardMarkets>(
    () => (arrived ? { ...arrived.markets, pending: false } : PENDING_MARKETS),
    [arrived]
  )
  // A retry fetches the market list alone — never the whole loader. Stable
  // on purpose: the workspace keys its live-feed effect on it, and a fresh
  // closure per render would resubscribe the feed on every market click.
  const {
    markets: shownMarkets,
    retry: onRetryMarkets,
    addRows,
  } = useDashboardMarkets(markets, protocol, network)
  // A market found on the venue joins the list for the session, so the
  // picker can show it and the chart can open it like any other.
  const onSearchMarkets = React.useCallback(
    async (query: string) => {
      const { rows } = await searchMarkets(protocol, network, query)
      addRows(rows)
      return rows
    },
    [addRows, network, protocol]
  )

  // The address wins; the account's memory fills a bare visit. A remembered
  // market that no longer resolves shows the honest missing state — never a
  // swap to some market that does. A memory from another network — or from
  // another exchange's dashboard, since the memory is shared across all of
  // them — is left alone rather than shown as missing: it should read as a
  // bare page here, not a delisting.
  const remembered =
    core.lastMarketKey &&
    marketKeyOnDashboard(core.lastMarketKey, protocol, network)
      ? core.lastMarketKey
      : null
  const selectedKey = market ?? remembered ?? null
  useMarketPageTitle(selectedKey, label)

  // The chart's opening bars. Until the exchange half lands the remembered
  // market carries a pending marker naming the slice on its way, so the
  // chart shows its loading state instead of asking the server a second time
  // for candles the stream already carries.
  const initialChart = React.useMemo<DashboardBootstrap["initialChart"]>(() => {
    if (arrived) {
      return arrived.initialChart
        ? { ...arrived.initialChart, pending: false }
        : null
    }
    if (!remembered) return null
    return {
      key: `${remembered}@${DEFAULT_CHART_INTERVAL}`,
      interval: DEFAULT_CHART_INTERVAL,
      candles: [],
      error: null,
      pending: true,
    }
  }, [arrived, remembered])

  // The account panel's first answer. While pending the panel shows its
  // browser-cached copy of the wallets rather than an empty claim.
  const wallets = React.useMemo<DashboardBootstrap["wallets"]>(
    () =>
      arrived
        ? { ...arrived.wallets, lastWalletIds, pending: false }
        : {
            rows: [],
            summaries: [],
            lastWalletIds,
            error: null,
            pending: true,
          },
    [arrived, lastWalletIds]
  )

  // Remember whichever market is on screen, so the next bare visit reopens
  // it. Best-effort and ref-guarded: the same market is never saved twice in
  // a row, and a failed save only loses the memory, not the view.
  const lastSavedRef = React.useRef(core.lastMarketKey)
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
      marketsPending={shownMarkets.pending}
      network={network}
      initialFolders={core.folders}
      initialPanelRows={core.panelRows}
      initialChartView={core.chartView}
      initialChart={initialChart}
      initialDrawings={core.drawings}
      initialPriceAlerts={core.priceAlerts}
      initialChartOptions={core.chartOptions}
      initialIndicators={core.indicators}
      initialCardFolds={core.cardFolds}
      initialQuickOrder={core.quickOrder}
      initialPanelLayouts={core.panelLayouts}
      initialRunningBots={core.runningBots}
      initialWallets={wallets}
      selectedKey={selectedKey}
      onSelectMarket={(key) => {
        const href = marketChartHref(key)
        if (href) void navigate({ href })
      }}
      onRetryMarkets={onRetryMarkets}
      onSearchMarkets={onSearchMarkets}
    />
  )
}
