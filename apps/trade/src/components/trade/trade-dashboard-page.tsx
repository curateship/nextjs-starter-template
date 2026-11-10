import * as React from "react"
import { getRouteApi, useLoaderData, useNavigate, useSearch } from "@tanstack/react-router"

import { useMarketPageTitle } from "@/app/page-title"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { DashboardPageMenu } from "@/components/trade/notes/page-menus"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { ManageWidgetsProvider } from "@/components/shared/widgets/widget-menus"
import { useTradePage, type TradePage } from "@/components/trade/notes/trade-page-panel"
import {
  ProtocolsMenuRows,
  ProtocolsRows,
  useProtocolPositionCounts,
} from "@/components/trade/protocols-block"
import { BlockColumnsProvider } from "@/components/trade/block-columns"
import { TradeWorkspace } from "@/components/trade/trade-workspace"
import {
  TradingOverviewGrid,
  useTradingOverview,
} from "@/components/trade/trading-overview-dashboard"
import {
  useDashboardMarkets,
  type DashboardMarkets,
} from "@/components/trade/use-dashboard-markets"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import {
  DASHBOARD_PROTOCOLS,
  dashboardHasPractice,
  marketChartHref,
  protocolLabel,
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
import {
  getTradeDashboardErrorMessage,
  loadHiddenTradeBlockColumns,
  loadTradeDashboardStartRead,
  saveDashboardView,
  saveHiddenDashboardProtocols,
  saveHiddenTradeBlockColumns,
  saveHideEmptyDashboardBlocks,
} from "@/lib/api/trade/trade-dashboard"
import type {
  HiddenBlockColumns,
  HideableColumn,
  TradeTableBlock,
} from "@/lib/trade/block-columns"
import {
  getTradingOverviewErrorMessage,
  loadTradingOverviewLayout,
  saveTradingOverviewLayout,
} from "@/lib/api/trade/trading-overview"
import type { TradeDashboardStart } from "@/server/trade/prefs"
import { DEFAULT_CHART_INTERVAL } from "@/lib/trade/chart-interval"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import {
  dashboardNetwork,
  FIRST_DASHBOARD_PROTOCOL,
  marketProtocol,
  OVERVIEW_VIEW,
  shownProtocols,
  viewFromSearch,
  type DashboardView,
  type TradeDashboardSearch,
} from "@/lib/trade/dashboard-view"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import { DEFAULT_TRADING_RULES } from "@/lib/trade/trading-rules"
import { emptyTradePanelLayouts } from "@/lib/trade/panel-layout"
import { seedSmartPrefs } from "@/lib/trade/smart-prefs-cache"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import { DEFAULT_MARKET_PANEL_ROWS } from "@/lib/trade/market-folders"
import { busiestMarketKey } from "@/lib/trade/market-volume"
import { dashboardBootstrapVersion } from "@/lib/trade/dashboard-bootstrap-cache"
import { seedTradeSounds } from "@/lib/trade/trade-sounds"
import { useStreamed } from "@/lib/trade/use-streamed"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { showErrorToast } from "@/lib/toast/error-toast"
import { marketKeyOnDashboard } from "@/lib/trade/trade-network"
import { botsRecordSearch, botsViewSearch } from "@/lib/bots/bots-search"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * The Trade dashboard at `/trade` (Tyler, 8 Nov 2026: "I want to revamp the
 * trade dashboard and consolidate everything into one 3 panel dashboard"). It
 * takes the place of the trading overview and of every exchange's own
 * dashboard. The left page's Protocols block picks what the middle shows:
 * Overview's widgets, or an exchange's chart and tables. The address says
 * which; `@/lib/trade/dashboard-view` has the rules.
 *
 * What carries on across a switch lives here, above the exchange's half:
 * the left page (one per person), Overview's layout and figures, the hidden
 * exchanges, and the open positions counts. The exchange's half is drawn
 * again for each exchange.
 */

function sessionMarketKey(protocol: ProtocolId, network: NetworkId) {
  return `trade:last-market:${protocol}:${network}`
}

/**
 * A protocol change can outrun the account save. Keep the market locally too,
 * so returning to a dashboard in the same visit never opens blank while that
 * save is still travelling to the server.
 */
function readSessionMarket(protocol: ProtocolId, network: NetworkId) {
  if (typeof window === "undefined") return null
  try {
    const saved = window.sessionStorage.getItem(sessionMarketKey(protocol, network))
    return saved && marketKeyOnDashboard(saved, protocol, network) ? saved : null
  } catch {
    return null
  }
}

function rememberSessionMarket(
  protocol: ProtocolId,
  network: NetworkId,
  marketKey: string
) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(sessionMarketKey(protocol, network), marketKey)
  } catch {
    // The account save below still makes the choice available next visit.
  }
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
    // An unread page opens locked, so nothing typed can overwrite a saved
    // page the server could not hand over.
    page: { body: null, locked: true, coverUrl: null, coverImages: [] },
    folders: [],
    panelRows: DEFAULT_MARKET_PANEL_ROWS,
    lastMarketKey: null,
    chartView: null,
    chartOptions: DEFAULT_CHART_OPTIONS,
    tradingRules: DEFAULT_TRADING_RULES,
    indicators: defaultIndicatorSettings(),
    cardFolds: {},
    quickOrder: DEFAULT_QUICK_ORDER,
    panelLayouts: emptyTradePanelLayouts(),
    smartDca: null,
    smartGrid: null,
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
 * The exchange the dashboard showed last in this browser tab, so moving to
 * Overview keeps the same exchange's half loaded rather than reading it all
 * again. Browser only: on the server it would be shared by everyone.
 */
let lastShownProtocol: ProtocolId | null = null

/**
 * What the route's loader waits on. The exchange comes from the address, or
 * on Overview and on a bare `/trade` from the exchange shown last; the
 * network is the address's, on an exchange that has a practice network.
 */
export function tradeDashboardLoaderDeps({ search }: { search: TradeDashboardSearch }) {
  const view = viewFromSearch(search)
  const named = view && view !== OVERVIEW_VIEW ? view : null
  const protocol = named ?? (typeof window === "undefined" ? null : lastShownProtocol)
  return {
    protocol,
    network: (protocol ? dashboardNetwork(protocol, search) : (search.network ?? "mainnet")) as NetworkId,
    bootstrapVersion: dashboardBootstrapVersion(),
  }
}

type TradeDashboardDeps = ReturnType<typeof tradeDashboardLoaderDeps>

/**
 * Three server calls that leave together: where a bare visit opens (the row
 * and exchange picked last, and the hidden exchanges), and the exchange's two
 * halves from `@/lib/api/trade/dashboard`. Only the database halves are
 * awaited; the exchange half streams its answer into the painted page. When
 * the address names no exchange, the exchange's halves wait for the first
 * read to say which.
 */
export async function tradeDashboardLoader({ deps }: { deps: TradeDashboardDeps }) {
  const startPromise = loadTradeDashboardStartRead().catch(() => null)
  const protocol = deps.protocol ?? (await startPromise)?.protocol ?? FIRST_DASHBOARD_PROTOCOL
  const network: NetworkId = deps.protocol
    ? deps.network
    : dashboardHasPractice(protocol) && deps.network === "testnet"
      ? "testnet"
      : "mainnet"
  const exchange = loadDashboardExchange(protocol, network).catch(exchangeUnanswered)
  const [core, start, columns] = await Promise.all([
    loadDashboardCore(protocol, network).catch(coreUnanswered),
    startPromise,
    loadHiddenTradeBlockColumns().catch(() => null),
  ])
  return { ...core, protocol, network, exchange, start, columns }
}

type TradeDashboardData = Awaited<ReturnType<typeof tradeDashboardLoader>>

/** What a bare visit opens on when the account has nothing saved yet. */
const NOTHING_SAVED: TradeDashboardStart = {
  view: null,
  protocol: null,
  hiddenProtocols: [],
  hideEmptyBlocks: false,
}

/** Overview's layout, kept for each person through Trade's own server calls. */
const OVERVIEW_LAYOUT_STORE: WidgetStore = {
  load: loadTradingOverviewLayout,
  save: saveTradingOverviewLayout,
  message: getTradingOverviewErrorMessage,
}

/** The market list before the exchange half of the opening answer lands. */
const PENDING_MARKETS: DashboardMarkets = {
  catalogs: [],
  error: null,
  pending: true,
}

export function TradeDashboard() {
  // Non-strict, because the route file holds the loader; its shape is the one
  // above, the only loader that renders this.
  const data = useLoaderData({ strict: false }) as TradeDashboardData
  const search = useSearch({ strict: false }) as TradeDashboardSearch
  const navigate = useNavigate()
  const isAdmin = authenticatedRoute.useLoaderData().user.role === "admin"
  const [start] = React.useState(() => data.start ?? NOTHING_SAVED)
  // The row the address picks, or the one picked last, or Overview the
  // first time ("Last one you had").
  const view: DashboardView = viewFromSearch(search) ?? start.view ?? OVERVIEW_VIEW
  const onOverview = view === OVERVIEW_VIEW

  React.useEffect(() => {
    lastShownProtocol = data.protocol
  }, [data.protocol])

  // The left page, one per person: read once with the first answer and kept
  // here, so it carries on as the exchange changes.
  const page = useTradePage({ initial: data.page })
  const widgets = useWidgetLayout(OVERVIEW_LAYOUT_STORE, null)
  // The left page's ⋮, held here so a widget's Manage widgets opens it at Widgets.
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])
  const overviewRead = useTradingOverview(onOverview)
  const counts = useProtocolPositionCounts()

  // ----- The exchanges hidden from the Protocols block, saved in turn ------
  const [hidden, setHidden] = React.useState<ProtocolId[]>(start.hiddenProtocols)
  const storedHidden = React.useRef(start.hiddenProtocols)
  const hiddenQueue = React.useRef<Promise<void>>(Promise.resolve())
  const changeHidden = React.useCallback((next: ProtocolId[]) => {
    setHidden(next)
    hiddenQueue.current = hiddenQueue.current.then(async () => {
      try {
        storedHidden.current = await saveHiddenDashboardProtocols(next)
      } catch (error) {
        setHidden(storedHidden.current)
        showErrorToast(getTradeDashboardErrorMessage(error))
      }
    })
  }, [])

  // ----- The columns each trade block hides, saved in turn ---------------
  const [columns, setColumns] = React.useState<HiddenBlockColumns>(() => data.columns ?? {})
  // The latest choice, so two quick presses on different blocks build on each other.
  const latestColumns = React.useRef(columns)
  const storedColumns = React.useRef(columns)
  const columnsQueue = React.useRef<Promise<void>>(Promise.resolve())
  const changeColumns = React.useCallback((block: TradeTableBlock, hidden: HideableColumn[]) => {
    const next = { ...latestColumns.current, [block]: hidden }
    latestColumns.current = next
    setColumns(next)
    columnsQueue.current = columnsQueue.current.then(async () => {
      try {
        storedColumns.current = await saveHiddenTradeBlockColumns(next)
      } catch (error) {
        latestColumns.current = storedColumns.current
        setColumns(storedColumns.current)
        showErrorToast(getTradeDashboardErrorMessage(error))
      }
    })
  }, [])
  const blockColumns = React.useMemo(
    () => ({ hidden: columns, change: changeColumns }),
    [columns, changeColumns]
  )

  // ----- "Hide empty blocks", saved on the account -----------------------
  const [hideEmpty, setHideEmpty] = React.useState(start.hideEmptyBlocks)
  const storedHideEmpty = React.useRef(start.hideEmptyBlocks)
  const changeHideEmpty = React.useCallback((next: boolean) => {
    setHideEmpty(next)
    saveHideEmptyDashboardBlocks(next).then(
      (stored) => {
        storedHideEmpty.current = stored
      },
      (error: unknown) => {
        setHideEmpty(storedHideEmpty.current)
        showErrorToast(getTradeDashboardErrorMessage(error))
      }
    )
  }, [])

  // ----- The row picked, remembered for the next bare visit ---------------
  // Saved the moment a row is picked, not once the exchange has loaded: that
  // can take seconds, and a visit opened in between would find the old row.
  // A row reached another way, such as a notice's link to a market, is saved
  // once it shows. Best effort: a failed save only loses the memory.
  const lastSavedView = React.useRef(start.view)
  const rememberView = React.useCallback((next: DashboardView) => {
    if (next === lastSavedView.current) return
    lastSavedView.current = next
    saveDashboardView(next).catch(() => {})
  }, [])
  React.useEffect(() => rememberView(view), [rememberView, view])

  const pick = React.useCallback(
    (next: DashboardView) => {
      // What was typed in the last moments is saved first: another exchange
      // draws the page again from what is held here.
      page.flush()
      rememberView(next)
      void navigate({ to: "/trade", search: { view: next } })
    },
    [navigate, page, rememberView]
  )

  const exchangeShown = onOverview ? data.protocol : view
  const protocolsBlock = (
    <ProtocolsRows
      view={view}
      protocols={shownProtocols(hidden, exchangeShown)}
      widgets={widgets.layout ? widgetsShown(widgets.layout) : null}
      counts={counts}
      onPick={pick}
    />
  )

  const protocolsMenu = (
    <ProtocolsMenuRows
      all={DASHBOARD_PROTOCOLS}
      hidden={hidden}
      onHiddenChange={changeHidden}
    />
  )

  const pageMenu = ({ alerts }: { alerts: React.ReactNode }) => (
    <DashboardPageMenu
      menuState={leftMenu}
      alerts={alerts}
      lock={page.lock}
      cover={page.cover}
      hideEmptyBlocks={{ on: hideEmpty, onChange: changeHideEmpty }}
      widgets={{
        layout: widgets.layout,
        error: widgets.error,
        onRetry: widgets.retry,
        onChange: widgets.change,
      }}
    />
  )

  // Overview's widgets, once both the layout and the first figures are in.
  const readError = widgets.error ?? overviewRead.error
  const overview = !onOverview ? null : widgets.layout && overviewRead.overview ? (
    <TradingOverviewGrid
      overview={overviewRead.overview}
      layout={widgets.layout}
      onChange={widgets.change}
      // Running bots opens a bot on the Bots dashboard, which only an admin can open.
      onOpenBot={
        isAdmin
          ? (runId) => void navigate({ to: "/bots", search: botsRecordSearch("bots", runId) })
          : undefined
      }
      onOpenRecipes={isAdmin ? () => void navigate({ to: "/bots", search: botsViewSearch("recipes") }) : undefined}
    />
  ) : readError ? (
    <ErrorRow
      message={readError}
      onRetry={() => {
        widgets.retry()
        overviewRead.retry()
      }}
    />
  ) : (
    <LoadingRow label="Reading your overview" />
  )

  return (
    <ManageWidgetsProvider value={manageWidgets}>
    <BlockColumnsProvider value={blockColumns}>
    <ExchangeDashboard
      // Drawn again for each exchange and network, as each exchange's own
      // page was, so nothing one exchange held shows on the next.
      key={`${data.protocol}:${data.network}`}
      data={data}
      page={page}
      pageMenu={pageMenu}
      protocolsBlock={protocolsBlock}
      protocolsMenu={protocolsMenu}
      hideEmptyBlocks={hideEmpty}
      overview={overview}
    />
    </BlockColumnsProvider>
    </ManageWidgetsProvider>
  )
}

/**
 * One exchange's half of the dashboard: the market on the chart, its lists,
 * and the workspace drawn for it. Drawn again from the start when the
 * exchange changes, as each exchange's own page used to be, so nothing one
 * exchange held can show on the next.
 */
function ExchangeDashboard({
  data,
  page,
  pageMenu,
  protocolsBlock,
  protocolsMenu,
  hideEmptyBlocks,
  overview,
}: {
  data: TradeDashboardData
  page: TradePage
  pageMenu: (parts: { alerts: React.ReactNode }) => React.ReactNode
  protocolsBlock: React.ReactNode
  protocolsMenu: React.ReactNode
  hideEmptyBlocks: boolean
  overview: React.ReactNode | null
}) {
  const { exchange, network, lastWalletIds, protocol, start: _start, columns: _columns, ...core } = data
  const label = protocolLabel(protocol)
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
  const { market: asked } = useSearch({ strict: false }) as TradeDashboardSearch
  // A market from another exchange belongs to the dashboard being loaded,
  // not to this one.
  const market = asked && marketProtocol(asked) === protocol ? asked : undefined
  const navigate = useNavigate()
  const [sessionMarket, setSessionMarket] = React.useState<string | null>(null)
  useEffectBeforePaint(() => {
    setSessionMarket(readSessionMarket(protocol, network))
  }, [network, protocol])

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
  // swap to some market that does. A memory from another network is left
  // alone rather than shown as missing: it should read as a bare page here,
  // not a delisting.
  const rememberedFromAccount =
    core.lastMarketKey &&
    marketKeyOnDashboard(core.lastMarketKey, protocol, network)
      ? core.lastMarketKey
      : null
  // The account can still contain the market from before this visit while its
  // newer save travels to the server. Prefer the visit's own choice until the
  // account catches up.
  const remembered = sessionMarket ?? rememberedFromAccount
  const selectedKey = market ?? remembered ?? null
  // A first visit to this exchange, with nothing named or remembered: open
  // its busiest market rather than an empty chart. Shown, never saved, so a
  // passing visit does not replace the market the person last chose. Chosen
  // once per visit: a fresh market list with a new busiest market must not
  // move the chart out from under whoever is reading it.
  const fallbackScope = `${protocol}:${network}`
  const [fallback, setFallback] = React.useState<{
    scope: string
    key: string
  } | null>(null)
  const pinned = fallback?.scope === fallbackScope ? fallback.key : null
  const busiest =
    (selectedKey ?? pinned) !== null
      ? null
      : busiestMarketKey(shownMarkets.catalogs, protocol, network)
  if (busiest) setFallback({ scope: fallbackScope, key: busiest })
  const shownKey = selectedKey ?? pinned ?? busiest
  // On Overview the tab is named after the dashboard; on an exchange, after
  // the market on the chart.
  useMarketPageTitle(overview === null ? shownKey : null, overview === null ? label : "Trade")

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
      initialTradingRules={core.tradingRules}
      initialIndicators={core.indicators}
      initialCardFolds={core.cardFolds}
      initialQuickOrder={core.quickOrder}
      initialPanelLayouts={core.panelLayouts}
      initialWallets={wallets}
      page={page}
      pageMenu={pageMenu}
      protocolsBlock={protocolsBlock}
      protocolsMenu={protocolsMenu}
      hideEmptyBlocks={hideEmptyBlocks}
      overview={overview}
      selectedKey={shownKey}
      onSelectMarket={(key) => {
        rememberSessionMarket(protocol, network, key)
        setSessionMarket(key)
        const href = marketChartHref(key)
        if (href) void navigate({ href })
      }}
      onRetryMarkets={onRetryMarkets}
      onSearchMarkets={onSearchMarkets}
    />
  )
}
