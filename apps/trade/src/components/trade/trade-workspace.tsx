import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import type { DashboardBootstrap } from "@/lib/api/trade/dashboard"
import {
  WalletDetailsDialog,
  WalletManagement,
} from "@/components/trade/account-panel"
import { FlattenWalletDialog } from "@/components/trade/flatten-wallet-dialog"
import {
  allowed,
  refusalOf,
  useProtocolAbilities,
} from "@/components/trade/use-protocol-abilities"
import {
  ActivityPanel,
  type ActivityTab,
} from "@/components/trade/activity-panel"
import { SmartOrdersPanel } from "@/components/trade/smart-orders-panel"
import { useTrading } from "@/components/trade/use-trading"
import { useTradeAccount } from "@/components/trade/use-trade-account"
import {
  AddWalletDialog,
  WalletSettingsDialog,
} from "@/components/trade/wallet-dialogs"
import { ChartOptionsMenu } from "@/components/trade/chart-options-menu"
import { ChartFullscreenButton } from "@/components/trade/chart-fullscreen-button"
import { ChartPanel, IntervalPicker } from "@/components/trade/chart-panel"
import { IndicatorsMenu } from "@/components/trade/indicators-menu"
import { useChartOptions } from "@/components/trade/use-chart-options"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import {
  MarketHeader,
  type MarketSelection,
} from "@/components/trade/market-header"
import { CardFolds } from "@/components/trade/card-folds"
import type { CardFolds as CardFoldsValue } from "@/lib/trade/card-folds"
import { useChartIndicators } from "@/components/trade/use-indicators"
import { MarketFoldersPanel } from "@/components/trade/market-folders-panel"
import { PriceAlertsPanel } from "@/components/trade/price-alerts-panel"
import { usePriceAlerts } from "@/components/trade/use-price-alerts"
import { PanelLayoutsMenu } from "@/components/trade/panel-layouts-menu"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  createFolder,
  getMarketFolderErrorMessage,
  loadFolders as reloadFolders,
  setFolderMarket,
} from "@/lib/api/trade/market-folders"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  CANDLE_INTERVALS,
  marketSymbol,
  parseMarketKey,
  type CandleInterval,
  type MarketRow,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import type { TradePosition } from "@/lib/trade/paper"
import type { ChartOptions } from "@/lib/trade/chart-options"
import type { ChartView } from "@/lib/trade/chart-view"
import type { IndicatorSettings } from "@/lib/trade/indicators/registry"
import type { LiveTrade } from "@/lib/trade/live-trades"
import {
  CHART_INTERVAL_STORAGE_KEY,
  DEFAULT_CHART_INTERVAL,
} from "@/lib/trade/chart-interval"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { startLiveMarketData } from "@/lib/trade/live-market"
import {
  useBlankSpaceDoubleClick,
  usePanelCollapsed,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { usePanelFit } from "@/lib/trade/panel-fit"
import { tradePanelIds, tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import {
  marketPanelScopeKey,
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"
import { listenForHeaderProfitVisibility } from "@/lib/trade/header-profit-visibility"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import type { RunningBot } from "@/lib/trade/running-bots"
import {
  WATCHED_ROW,
  favFolder,
  type MarketFolder,
  type MarketFolderActions,
  type MarketPanelRows,
} from "@/lib/trade/market-folders"
import {
  allCatalogMarketRows,
  catalogMarketRow,
  type FilteredMarketCatalog,
} from "@/lib/trade/market-volume"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { cn } from "@/lib/utils"

/**
 * No focus ring on a panel divider.
 *
 * The shell's divider draws one when it has keyboard focus, which is a line
 * the full height of the app appearing the moment any key goes down. Merged
 * last, so it beats the shell's own class without editing a shell file.
 */
const NO_RING = "focus-visible:ring-0"

/** Who is signed in, read the way the shell's own pages read it. */
const authenticatedRoute = getRouteApi("/_authenticated")

/** Which narrow-screen side panel the shared sheet belongs to. */
type SideSheet = {
  side: "markets" | "smart-orders"
  open: boolean
}

type WorkspaceMarketSelection =
  MarketSelection | { kind: "none" } | { kind: "missing"; marketId: string }

const NO_INITIAL_PRICE_ALERTS: DashboardBootstrap["priceAlerts"] = {
  rows: [],
  error: null,
}

/**
 * What the picked key means against the full exchange answer and the visible
 * rows: a real market, nothing picked, or a well-formed key the exchange did
 * not list. The daily-volume setting filters lists only, so a market omitted
 * there still resolves here with its full chart and order controls.
 */
function resolveSelection(
  catalogs: FilteredMarketCatalog[],
  selectedKey: string | null
): WorkspaceMarketSelection {
  if (!selectedKey) return { kind: "none" }
  const ref = parseMarketKey(selectedKey)
  if (!ref) return { kind: "none" }
  for (const catalog of catalogs) {
    const row = catalogMarketRow(catalog, selectedKey)
    if (row) {
      return {
        kind: "market",
        row,
        protocolLabel: catalog.protocolLabel,
        networkLabel: catalog.networkLabel,
        picker: catalog.picker,
      }
    }
  }
  return { kind: "missing", marketId: ref.marketId }
}

/**
 * The Trade workspace: markets on the left, the market you picked in the
 * middle, the account on the right, and what you are holding along the bottom.
 *
 * Built on the same panel parts as the Automation Canvas rather than a second
 * panel system of its own, so resizing, collapsing, the reopen tabs and the
 * remembered layout all behave identically on both pages and only have to be
 * got right once.
 *
 * The market list is live exchange data now. The account side is still the
 * empty state it will show a new user — connecting anything comes after the
 * protocol layer grows accounts.
 */
export function TradeWorkspace({
  protocol,
  catalogs,
  marketsError,
  marketsPending,
  network,
  initialFolders,
  initialPanelRows,
  initialChartView,
  initialChart,
  initialDrawings,
  initialPriceAlerts = NO_INITIAL_PRICE_ALERTS,
  initialChartOptions,
  initialIndicators,
  initialCardFolds,
  initialQuickOrder,
  initialPanelLayouts,
  initialRunningBots,
  initialWallets,
  selectedKey,
  onSelectMarket,
  onRetryMarkets,
}: {
  /**
   * The exchange this whole page belongs to — the route says which. Carried
   * as data into every wallet- and trading-scoped hook, so the account
   * column and the bottom panel only ever show this exchange's money.
   */
  protocol: ProtocolId
  catalogs: FilteredMarketCatalog[]
  /** The exchange call failed at load; the list shows this instead of rows. */
  marketsError: string | null
  /**
   * The market list is still streaming in with the opening answer. The list
   * shows a loading row, and nothing treats the empty catalogue as the
   * exchange's answer — a picked market is not "missing" yet, and the
   * narrow-screen market sheet does not open itself over the page.
   */
  marketsPending: boolean
  /** Which network the whole page is showing — resolved by the route. */
  network: NetworkId
  initialFolders: MarketFolder[]
  initialPanelRows: MarketPanelRows
  /** The zoom and scroll this account left the chart at. */
  initialChartView: ChartView | null
  /** The remembered chart's opening bars, carried by the route answer. */
  initialChart: DashboardBootstrap["initialChart"]
  /** The remembered chart's lines, carried by the route answer. */
  initialDrawings: DashboardBootstrap["drawings"]
  /** Armed lines from the same opening database answer. */
  initialPriceAlerts?: DashboardBootstrap["priceAlerts"]
  /** Which supporting parts of the chart this account has visible. */
  initialChartOptions: ChartOptions
  /** Which indicators this account has on, and what each is set to. */
  initialIndicators: IndicatorSettings
  /** How the trading windows' settings cards were left folded. */
  initialCardFolds: CardFoldsValue
  /** How the right-click order window was last set up. */
  initialQuickOrder: QuickOrderPrefs
  /** Divider positions and named arrangements owned by this account. */
  initialPanelLayouts: TradePanelLayouts
  /** The Bots tab's first answer from the dashboard's one opening call. */
  initialRunningBots: { rows: RunningBot[]; error: string | null }
  /** The account panel's first answer from the same opening call. */
  initialWallets: DashboardBootstrap["wallets"]
  /** The picked market's key, carried in the address bar. */
  selectedKey: string | null
  onSelectMarket: (key: string) => void
  onRetryMarkets: () => void
}) {
  // Known before the first render on both sides, so the page opens in the
  // layout it is going to keep instead of painting the phone version and
  // rebuilding itself a beat later.
  const { user } = authenticatedRoute.useLoaderData()
  const desktop = useWideScreen()
  // Memoised: the workspace re-renders on every poll and every price tick,
  // and a fresh answer each time made every panel below re-do its own work.
  const selection = React.useMemo(
    () => resolveSelection(catalogs, selectedKey),
    [catalogs, selectedKey]
  )
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)
  const [smartOrdersCollapsed, setSmartOrdersCollapsed] = React.useState(false)
  const [sideSheet, setSideSheet] = React.useState<SideSheet>({
    side: "markets",
    // With no substitute middle header, a narrow screen has no Markets
    // button. Open the sheet so a new account or stale link can choose one.
    // Not while the list is still streaming in, though: the picked market is
    // not missing yet, only unresolved.
    open: !desktop && !marketsPending && selection.kind !== "market",
  })
  const [sheetSeen, setSheetSeen] = React.useState({
    kind: selection.kind,
    marketsPending,
  })
  if (
    sheetSeen.kind !== selection.kind ||
    sheetSeen.marketsPending !== marketsPending
  ) {
    setSheetSeen({ kind: selection.kind, marketsPending })
    if (
      !desktop &&
      !marketsPending &&
      selection.kind !== "market" &&
      !sideSheet.open
    ) {
      setSideSheet({ side: "markets", open: true })
    }
  }

  // ----- Market folders: one exchange, optimistic item changes -------------
  const [folders, setFolders] = React.useState(initialFolders)
  // Where Watched and All markets sit and whether they show. Beside the
  // folders rather than inside them: neither row is a folder, and one drag
  // saves both halves together.
  const [panelRows, setPanelRows] = React.useState(initialPanelRows)
  const [folderBusy, setFolderBusy] = React.useState(false)
  const folderQueues = React.useRef(new Map<string, Promise<void>>())
  async function toggleFolderMarket(
    key: string,
    folderId: string,
    saved: boolean
  ) {
    setFolders((current) =>
      current.map((folder) =>
        folder.id !== folderId
          ? folder
          : {
              ...folder,
              marketKeys: saved
                ? [...new Set([...folder.marketKeys, key])]
                : folder.marketKeys.filter((one) => one !== key),
            }
      )
    )
    const previous = folderQueues.current.get(folderId) ?? Promise.resolve()
    const queued = previous
      .then(async () => {
        await setFolderMarket({ folderId, marketKey: key, saved })
      })
      .catch(async (error) => {
        showErrorToast(getMarketFolderErrorMessage(error))
        try {
          setFolders(await reloadFolders(protocol, network))
        } catch {
          // The original save error is already visible. A later dashboard load
          // will reconcile the folders if this recovery read also fails.
        }
      })
    folderQueues.current.set(folderId, queued)
    await queued
    if (folderQueues.current.get(folderId) === queued) {
      folderQueues.current.delete(folderId)
    }
  }

  function quickAddToFav(key: string) {
    const folder = favFolder(folders)
    if (folder) {
      void toggleFolderMarket(key, folder.id, true)
      return
    }
    showErrorToast("Fav could not be loaded. Reload the page and try again.")
  }

  async function createFolderWithMarket(key: string, name: string) {
    if (folderBusy) return false
    setFolderBusy(true)
    try {
      setFolders(
        await createFolder({ protocol, network, name, marketKey: key })
      )
      return true
    } catch (error) {
      showErrorToast(getMarketFolderErrorMessage(error))
      return false
    } finally {
      setFolderBusy(false)
    }
  }

  const folderActions: MarketFolderActions = {
    busy: folderBusy,
    quickAdd: quickAddToFav,
    toggle: toggleFolderMarket,
    create: createFolderWithMarket,
  }

  // ----- Wallets: one owner, shared by the desktop column and the sheet ----
  const dashboardCacheScope = `${user.id}:${protocol}`
  const account = useTradeAccount(protocol, dashboardCacheScope, initialWallets)
  // What this exchange allows beyond placing an order — read from the server's
  // own table rather than decided here, which the protocol fence forbids.
  const abilities = useProtocolAbilities(protocol)
  const [addingWallet, setAddingWallet] = React.useState(false)
  const [walletDetailsId, setWalletDetailsId] = React.useState<string | null>(
    null
  )
  const [editingWalletId, setEditingWalletId] = React.useState<string | null>(
    null
  )
  /**
   * The wallet whose "Empty wallet" press is being asked about.
   *
   * Held by id, and resolved against the live list on every render, so a wallet
   * deleted or switched off in another tab closes its own question instead of
   * emptying a ghost.
   */
  const [flatteningId, setFlatteningId] = React.useState<string | null>(null)
  // Resolved against the live list on every render, so a wallet deleted in
  // another tab closes its own window instead of editing a ghost.
  const editingWallet =
    account.wallets.find((wallet) => wallet.id === editingWalletId) ?? null
  const walletDetails =
    account.wallets.find((wallet) => wallet.id === walletDetailsId) ?? null
  const flattening =
    account.wallets.find((wallet) => wallet.id === flatteningId) ?? null

  // ----- Trading: one owner for the chart's lines and the panel ------------
  // Practice and real wallets flow through the same hook; it is the wallet a
  // row belongs to that decides which road an action takes.
  /**
   * Which bottom tab is showing, owned here because two things need it: the
   * panel draws it, and the poll uses it to decide whether the Journal's
   * trade history is worth asking the exchange for at all.
   */
  const [activityTab, setActivityTab] = React.useState<ActivityTab>("positions")
  const trading = useTrading(
    account.activeWallet,
    protocol,
    activityTab === "journal"
  )
  const fallbackMarks = React.useMemo(
    () =>
      new Map(
        catalogs.flatMap((catalog) =>
          allCatalogMarketRows(catalog).map(
            (market) => [market.key, market.price] as const
          )
        )
      ),
    [catalogs]
  )
  const activeSummary = account.activeWallet
    ? account.summaryOf(account.activeWallet.id)
    : null
  const free = activeSummary?.state === "ok" ? activeSummary.free : 0
  const equity = activeSummary?.state === "ok" ? activeSummary.equity : 0

  // A trade changes what the account is worth, so the two polls are nudged
  // into step: the moment the trading side goes quiet, the wallet figures are
  // read again. In an effect rather than during the render, because it is a
  // request — a render can run twice or be thrown away, and a request must not.
  const tradingBusy = trading.busy
  const refreshAccount = account.refresh
  const wasTradingBusy = React.useRef(tradingBusy)
  React.useEffect(() => {
    if (wasTradingBusy.current && !tradingBusy) void refreshAccount()
    wasTradingBusy.current = tradingBusy
  }, [tradingBusy, refreshAccount])

  // A divider dragged with the mouse keeps keyboard focus, and its arrow keys
  // would then resize a panel with nothing on screen saying so. Handing focus
  // back when the drag lets go is what stops that. Tabbing to one is untouched
  // — that fires no pointerup.
  React.useEffect(() => {
    const onPointerUp = () => {
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        active.getAttribute("role") === "separator"
      ) {
        active.blur()
      }
    }
    window.addEventListener("pointerup", onPointerUp)
    return () => window.removeEventListener("pointerup", onPointerUp)
  }, [])

  // The chart's timeframe, owned here so the header's picker and the chart's
  // fetch read the same choice.
  const [interval, setInterval] = useRememberedChoice<CandleInterval>(
    CHART_INTERVAL_STORAGE_KEY,
    DEFAULT_CHART_INTERVAL,
    CANDLE_INTERVALS
  )

  // The indicators, owned here for the same reason: the header's menu switches
  // them on and the chart below draws them, so both have to be reading one
  // answer. They belong to the account rather than to the market, exactly like
  // the zoom — an indicator is how you read a chart, not a fact about a coin.
  const indicators = useChartIndicators(initialIndicators)
  const chartOptions = useChartOptions(initialChartOptions)
  const priceAlerts = usePriceAlerts(initialPriceAlerts)

  // The live feed: one watch per catalog, torn down with the page. When the
  // feed recovers from a gap it refetches the loader's snapshot, so figures
  // that moved during the outage do not linger.
  React.useEffect(
    () => startLiveMarketData(catalogs, onRetryMarkets),
    [catalogs, onRetryMarkets]
  )

  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const alertsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const smartOrdersPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const activityPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const { collapsed: alertsCollapsed, onResize: onAlertsResize } =
    usePanelCollapsed(alertsPanelRef)
  const horizontalGroupElementRef = React.useRef<HTMLDivElement | null>(null)
  const verticalGroupElementRef = React.useRef<HTMLDivElement | null>(null)

  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)
  const headerProfitVisibleRef = React.useRef(
    initialPanelLayouts.headerProfitVisible
  )
  React.useEffect(
    () =>
      listenForHeaderProfitVisibility((visible) => {
        headerProfitVisibleRef.current = visible
      }),
    []
  )
  const marketPanelScope = React.useMemo(
    () => ({ protocol, network }),
    [network, protocol]
  )
  const marketPanelScopeId = marketPanelScopeKey(marketPanelScope)
  const hasSavedOpenMarketRow = Object.prototype.hasOwnProperty.call(
    panelLayouts.layouts.openMarketRows,
    marketPanelScopeId
  )
  const expandedMarketRowId = hasSavedOpenMarketRow
    ? (panelLayouts.layouts.openMarketRows[marketPanelScopeId] ?? null)
    : WATCHED_ROW
  const horizontalKey = tradePanelLayoutKey.workspaceHorizontal
  const marketColumnKey = tradePanelLayoutKey.workspaceMarketColumn
  const verticalKey = tradePanelLayoutKey.workspaceVertical
  const horizontalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[horizontalKey],
    panelLayouts.layouts.current[horizontalKey],
    (layout) => panelLayouts.remember(horizontalKey, layout)
  )
  const verticalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[verticalKey],
    panelLayouts.layouts.current[verticalKey],
    (layout) => panelLayouts.remember(verticalKey, layout)
  )
  const marketColumnLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[marketColumnKey],
    panelLayouts.layouts.current[marketColumnKey],
    (layout) => panelLayouts.remember(marketColumnKey, layout)
  )
  const [chartFullscreen, setChartFullscreen] = React.useState(false)
  const fullscreenLayouts = React.useRef<{
    horizontal: ReturnType<typeof horizontalLayout.getLayout>
    vertical: ReturnType<typeof verticalLayout.getLayout>
  }>({ horizontal: null, vertical: null })
  const fullscreenSheet = React.useRef<SideSheet | null>(null)
  const restoreFullscreenLayouts = React.useRef(false)

  const enterChartFullscreen = React.useCallback(() => {
    if (selection.kind !== "market") return
    restoreFullscreenLayouts.current = false
    fullscreenLayouts.current = {
      horizontal: horizontalLayout.getLayout(),
      vertical: verticalLayout.getLayout(),
    }
    fullscreenSheet.current = sideSheet
    setSideSheet((current) => ({ ...current, open: false }))
    horizontalLayout.setLayout({ markets: 0, chart: 100, "smart-orders": 0 })
    verticalLayout.setLayout({ workspace: 100, activity: 0 })
    setChartFullscreen(true)
  }, [horizontalLayout, selection.kind, sideSheet, verticalLayout])

  const exitChartFullscreen = React.useCallback(() => {
    restoreFullscreenLayouts.current = true
    if (fullscreenSheet.current) setSideSheet(fullscreenSheet.current)
    fullscreenSheet.current = null
    setChartFullscreen(false)
  }, [])

  // The full-screen frame is wider than the shell workspace. Restoring the
  // percentages while the panel group still measures that wider frame converts
  // them into larger pixel widths, and preserve-pixel-size carries those widths
  // back into the shell. Our observer was registered after the panel group's,
  // so its callback runs once that group has seen the normal shell size and can
  // safely accept the saved percentages again.
  useEffectBeforePaint(() => {
    if (chartFullscreen || !restoreFullscreenLayouts.current) return
    const restore = () => {
      if (!restoreFullscreenLayouts.current) return
      restoreFullscreenLayouts.current = false
      const before = fullscreenLayouts.current
      fullscreenLayouts.current = { horizontal: null, vertical: null }
      if (before.horizontal) horizontalLayout.setLayout(before.horizontal)
      if (before.vertical) verticalLayout.setLayout(before.vertical)
    }
    const horizontal = horizontalGroupElementRef.current
    const vertical = verticalGroupElementRef.current
    if (typeof ResizeObserver !== "undefined" && (horizontal || vertical)) {
      const observer = new ResizeObserver(() => {
        observer.disconnect()
        restore()
      })
      if (horizontal) observer.observe(horizontal)
      if (vertical) observer.observe(vertical)
      return () => observer.disconnect()
    }
    let secondFrame: number | null = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(restore)
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [chartFullscreen, horizontalLayout.setLayout, verticalLayout.setLayout])

  const toggleChartFullscreen = React.useCallback(() => {
    if (chartFullscreen) exitChartFullscreen()
    else enterChartFullscreen()
  }, [chartFullscreen, enterChartFullscreen, exitChartFullscreen])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && chartFullscreen) {
        event.preventDefault()
        exitChartFullscreen()
        return
      }
      if (
        event.key.toLocaleLowerCase() !== "f" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        editableTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      toggleChartFullscreen()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [chartFullscreen, exitChartFullscreen, toggleChartFullscreen])

  const createNamedLayout = React.useCallback(
    async (name: string) => {
      const horizontal = horizontalLayout.getLayout()
      const marketColumn = marketColumnLayout.getLayout()
      const vertical = verticalLayout.getLayout()
      if (!horizontal || !marketColumn || !vertical) {
        throw new Error("PANEL_LAYOUT_INVALID")
      }
      await panelLayouts.createNamed(
        name,
        horizontal,
        marketColumn,
        vertical,
        marketPanelScope,
        expandedMarketRowId,
        headerProfitVisibleRef.current
      )
    },
    [
      expandedMarketRowId,
      horizontalLayout,
      marketColumnLayout,
      marketPanelScope,
      panelLayouts,
      verticalLayout,
    ]
  )
  const applyNamedLayout = React.useCallback(
    (id: string) => panelLayouts.applyNamed(id, marketPanelScope),
    [marketPanelScope, panelLayouts]
  )
  // Pressing a tab in the bottom panel grows it to fit that tab's rows, through
  // the same resizable panel the divider drags. It also takes over saving the
  // vertical layout, because a grown height is never the remembered one.
  const activityFit = usePanelFit(
    activityPanelRef,
    verticalLayout.onLayoutChanged
  )

  const toggleMarketsPanel = usePanelToggle(marketsPanelRef)
  const toggleMarkets = React.useCallback(() => {
    toggleMarketsPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleMarketsPanel])
  const toggleSmartOrdersPanel = usePanelToggle(smartOrdersPanelRef)
  const toggleSmartOrders = React.useCallback(() => {
    toggleSmartOrdersPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleSmartOrdersPanel])
  const toggleAlertsPanel = usePanelToggle(alertsPanelRef)
  const toggleAlerts = React.useCallback(() => {
    toggleAlertsPanel()
    marketColumnLayout.rememberLayout()
  }, [marketColumnLayout, toggleAlertsPanel])
  const expandAlerts = React.useCallback(() => {
    const panel = alertsPanelRef.current
    if (!panel || !panel.isCollapsed()) return
    panel.expand()
    marketColumnLayout.rememberLayout()
  }, [marketColumnLayout])
  // Double-clicking the bottom panel's blank space shuts it, and this is the
  // one panel where that has to be spelled out rather than handed to
  // `usePanelToggle`.
  //
  // **Whether it was open is read BEFORE the growing is undone**, and the
  // panel is told plainly to shut or to open rather than to toggle. A toggle
  // asked afterwards judges a panel that undoing the growing has already
  // moved, and one gesture then did two things and came back to where it
  // started: a double-click shut the panel and opened it again in the same
  // motion, on alternate tries, with nothing on screen explaining why.
  const shrinkActivity = activityFit.shrink
  const toggleActivity = React.useCallback(() => {
    const panel = activityPanelRef.current
    if (!panel) return
    const wasOpen = !panel.isCollapsed()
    shrinkActivity()
    if (wasOpen) panel.collapse()
    else panel.expand()
    verticalLayout.rememberLayout()
  }, [shrinkActivity, verticalLayout])

  // Double-clicking the empty part of a panel shuts it, and double-clicking
  // what is left of it opens it again.
  const marketsDoubleClick = useBlankSpaceDoubleClick(toggleMarkets)
  const smartOrdersDoubleClick = useBlankSpaceDoubleClick(toggleSmartOrders)
  const activityDoubleClick = useBlankSpaceDoubleClick(toggleActivity)
  const alertsDoubleClick = useBlankSpaceDoubleClick(toggleAlerts)

  // A slid-open panel belongs to the narrow layout, so crossing the width
  // boundary shuts it. Widening otherwise leaves the sheet sitting over the
  // whole workspace with the button that opened it gone from the header — and
  // the panel it stands in for visible behind it. Narrowing again must not
  // bring it back by itself either, which is why either direction closes it.
  //
  // Adjusted during render rather than in an effect: React re-runs the render
  // immediately without painting in between, so the sheet is already gone in
  // the frame the new layout appears in.
  const [lastDesktop, setLastDesktop] = React.useState(desktop)
  if (desktop !== lastDesktop) {
    setLastDesktop(desktop)
    setSideSheet((current) => ({ ...current, open: false }))
  }

  // The finished trade drawn on the chart, picked in the Journal. It lives up
  // here because two panels share it: the table below decides which one, and
  // the chart above draws it. Picking one in another market also switches the
  // chart to that market — otherwise the row would look broken.
  const [shownTrade, setShownTrade] = React.useState<LiveTrade | null>(null)
  const showTrade = React.useCallback(
    (trade: LiveTrade | null) => {
      setShownTrade(trade)
      if (trade && trade.marketKey !== selectedKey)
        onSelectMarket(trade.marketKey)
    },
    [onSelectMarket, selectedKey]
  )

  /**
   * Buying more of what a position row holds.
   *
   * **The chart and the wallet both move first, and the order window is held
   * back until they have.** Two wallets can hold the same coin, so a window
   * that opened before the switch landed would put the order on the wallet you
   * were looking at rather than the one you pressed — which is the whole
   * mistake this button exists to remove.
   *
   * The request is a note saying which position was asked for; the gate on
   * `addTo` below is what says both switches have really happened. Nothing here
   * places anything: the window is where the size is chosen, and that is
   * deliberate — a "double it" press with no window is how a wrong size goes
   * through.
   */
  const [adding, setAdding] = React.useState<TradePosition | null>(null)
  const switchWallet = account.switchWallet
  const addToPosition = React.useCallback(
    (position: TradePosition) => {
      const symbol = marketSymbol(position.marketKey)
      const wallet = account.wallets.find((one) => one.id === position.walletId)
      if (!wallet || wallet.status !== "active") {
        showErrorToast(
          `The wallet holding this ${symbol} position is not switched on, so nothing can be added to it.`
        )
        return
      }
      if (wallet.kind === "live" && !wallet.hasKey) {
        showErrorToast(
          `${wallet.label} has no trading key saved, so nothing can be added to its ${symbol} position.`
        )
        return
      }
      // Asked before anything moves. A market the exchange has stopped listing
      // cannot be charted, and the window would never open — better to say so
      // than to switch the chart to an empty panel and leave it there.
      if (resolveSelection(catalogs, position.marketKey).kind !== "market") {
        showErrorToast(
          `The exchange is not listing ${symbol} right now, so nothing can be added to that position.`
        )
        return
      }
      if (position.marketKey !== selectedKey) onSelectMarket(position.marketKey)
      if (position.walletId !== account.activeWallet?.id) {
        switchWallet(position.walletId)
      }
      setAdding(position)
    },
    [
      account.wallets,
      account.activeWallet?.id,
      catalogs,
      onSelectMarket,
      selectedKey,
      switchWallet,
    ]
  )

  // A request nothing ever picked up is dropped rather than left waiting. The
  // two switches land within a frame or two; anything still pending after this
  // means the page moved on, and a window opening minutes later would be a
  // press nobody remembers making.
  React.useEffect(() => {
    if (!adding) return
    const giveUp = window.setTimeout(() => setAdding(null), 5_000)
    return () => window.clearTimeout(giveUp)
  }, [adding])

  // Stable, because the chart panel's effect lists it as a dependency. An
  // arrow written at the call site is a new function on every render of this
  // workspace, which would re-run that effect on every poll and every price
  // tick for as long as a request was pending.
  const addOpened = React.useCallback(() => setAdding(null), [])

  const walletNameOf = React.useCallback(
    (walletId: string) =>
      trading.walletNames.get(walletId) ??
      account.wallets.find((wallet) => wallet.id === walletId)?.label ??
      "another wallet",
    [trading.walletNames, account.wallets]
  )

  // Folders stays one panel rather than splitting folders and markets again:
  // Watched is its first row and All markets its last (decided 23 Aug 2026).
  // Alerts has its own remembered split below it.
  const marketColumn = (
    <ResizablePanelGroup
      data-panel-group="market-column"
      groupRef={marketColumnLayout.groupRef}
      orientation="vertical"
      className="min-h-0 flex-1"
      onLayoutChanged={marketColumnLayout.onLayoutChanged}
    >
      <ResizablePanel id="folders" defaultSize="68%" minSize="8.5rem">
        <WorkspacePanel
          collapsed={marketsCollapsed}
          onDoubleClick={marketsDoubleClick}
          className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
        >
          <MarketFoldersPanel
            folders={folders}
            protocol={protocol}
            network={network}
            catalogs={catalogs}
            marketsError={marketsError}
            marketsPending={marketsPending}
            // The same list the chart draws its waiting lines from and the Open
            // orders tab lists, so the row can never disagree with either.
            watchedOrders={{
              rows: trading.watchOrders,
              // The account and the exchange together, so one person's levels
              // never flash up for the next person to sign in on this machine,
              // and one exchange's never flash up on another's page.
              cacheScope: `${user.id}:${protocol}`,
              // NOT `trading.loading`: that turns false when the practice half
              // lands on its own, and a screen whose waiting levels are all on
              // real wallets would say "nothing is waiting" until the exchange
              // answered.
              settled: trading.settled,
              failed: trading.failed,
              // Why a level has not fired. See `RefusalNote` — without it a level
              // the exchange keeps refusing reads as one quietly waiting.
              refusals: trading.refusals,
              onRetry: trading.retry,
            }}
            walletName={walletNameOf}
            expandedId={expandedMarketRowId}
            selectedMarketKey={selectedKey}
            panelRows={panelRows}
            onFoldersChange={setFolders}
            onPanelRowsChange={setPanelRows}
            onExpandedIdChange={(id) =>
              panelLayouts.rememberOpenMarketRow(marketPanelScope, id)
            }
            onSelectMarket={onSelectMarket}
            onRetryMarkets={onRetryMarkets}
          />
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap className={NO_RING} />
      <ResizablePanel
        id="alerts"
        panelRef={alertsPanelRef}
        defaultSize="32%"
        minSize="8.5rem"
        groupResizeBehavior="preserve-pixel-size"
        collapsible
        collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
        onResize={onAlertsResize}
      >
        <WorkspacePanel
          collapsed={marketsCollapsed}
          headerOnly={alertsCollapsed}
          onDoubleClick={alertsDoubleClick}
          className="flex w-full min-w-0 flex-col"
        >
          <PriceAlertsPanel
            alerts={priceAlerts.alerts}
            error={priceAlerts.error}
            collapsed={alertsCollapsed}
            onRetry={() => void priceAlerts.refresh()}
            onExpand={expandAlerts}
            onSelectMarket={onSelectMarket}
            onDelete={priceAlerts.remove}
          />
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  )

  // Memoised for the same reason: a new array here re-sorted the whole
  // market picker on every render, with the picker closed.
  const marketRows = React.useMemo(
    () => catalogs.flatMap((catalog) => catalog.rows),
    [catalogs]
  )
  // Every market by key, so a row can find its own art and its fallback price
  // without searching the catalogues itself.
  const marketsByKey = React.useMemo(() => {
    const byKey = new Map<string, MarketRow>()
    for (const catalog of catalogs) {
      for (const row of allCatalogMarketRows(catalog)) byKey.set(row.key, row)
    }
    return byKey
  }, [catalogs])

  const walletManagement = (
    <WalletManagement
      account={account}
      cacheScope={dashboardCacheScope}
      detailsOpen={walletDetails !== null}
      onAddWallet={() => setAddingWallet(true)}
      onOpenWalletDetails={(wallet) => setWalletDetailsId(wallet.id)}
    />
  )

  const smartOrdersPanel = (
    <SmartOrdersPanel
      key={protocol}
      protocol={protocol}
      initialBots={initialRunningBots.rows}
      initialBotsError={initialRunningBots.error}
      cacheScope={dashboardCacheScope}
      smartOrders={trading.smartOrders}
      positions={trading.positions}
      fills={trading.fills}
      trades={trading.trades}
      markets={marketsByKey}
      wallets={account.wallets}
      walletName={walletNameOf}
      selectedMarketKey={selectedKey}
      // The practice half can finish first. Wait for every wallet before an
      // empty Smart orders result is allowed to mean nothing is working.
      settled={trading.settled}
      failed={trading.failed}
      onRetry={trading.retry}
      onResumeSmartOrder={trading.resumeSmartOrder}
      onSelectMarket={onSelectMarket}
    />
  )

  const middle = (
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and without
    // a width to fill it shrinks to its content.
    <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
      {selection.kind === "market" ? (
        <MarketHeader
          selection={selection}
          markets={marketRows}
          folders={folders}
          folderActions={folderActions}
          onSelectMarket={onSelectMarket}
          // The chart's own controls live in the header row. Indicators sit
          // to the right of the timeframe: which candles first, then what to
          // draw on them.
          toolbar={
            <>
              <IntervalPicker value={interval} onChange={setInterval} />
              <IndicatorsMenu
                indicators={indicators}
                context={{ zone: chartOptions.options.zone, interval }}
              />
              <ChartOptionsMenu control={chartOptions} />
              {desktop && !chartFullscreen ? (
                <PanelLayoutsMenu
                  layouts={panelLayouts.layouts.named}
                  activeId={panelLayouts.layouts.activeNamedId}
                  onCreate={createNamedLayout}
                  onApply={applyNamedLayout}
                  onDelete={panelLayouts.deleteNamed}
                />
              ) : null}
              <ChartFullscreenButton
                active={chartFullscreen}
                onToggle={toggleChartFullscreen}
              />
              <span className="h-5 border-l" aria-hidden />
              {walletManagement}
            </>
          }
          // On a wide screen both panels are already on screen, so the buttons
          // would only be a second way to do what the dividers already do.
          onOpenMarkets={
            desktop
              ? undefined
              : () => setSideSheet({ side: "markets", open: true })
          }
          onOpenSmartOrders={
            desktop
              ? undefined
              : () => setSideSheet({ side: "smart-orders", open: true })
          }
        />
      ) : chartFullscreen ? (
        <div className="flex justify-end border-b p-1">
          <ChartFullscreenButton active onToggle={exitChartFullscreen} />
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <ChartPanel
            selectedKey={selectedKey}
            interval={interval}
            initialChartView={initialChartView}
            initialChart={initialChart}
            initialDrawings={initialDrawings}
            priceAlerts={priceAlerts.alerts}
            onCreatePriceAlert={priceAlerts.create}
            onMovePriceAlert={priceAlerts.move}
            onDeletePriceAlert={priceAlerts.remove}
            initialQuickOrder={initialQuickOrder}
            recentOrderScope={user.id}
            options={chartOptions.options}
            indicators={indicators.settings}
            market={selection.kind === "market" ? selection.row : null}
            trading={trading}
            free={free}
            equity={equity}
            shownTrade={shownTrade}
            onClearShownTrade={() => setShownTrade(null)}
            // The gate: the chart is on that row's coin AND the traded wallet
            // is that row's wallet. Until both are true this stays null and
            // the order window does not open.
            addTo={
              adding &&
              adding.marketKey === selectedKey &&
              adding.walletId === account.activeWallet?.id
                ? adding
                : null
            }
            onAddOpened={addOpened}
          />
        </div>
        {/* Shown where the panel disappeared, so getting it back is findable
            without remembering that the divider is still draggable. */}
        {desktop && marketsCollapsed && !chartFullscreen ? (
          <PanelReopenTab
            side="left"
            label="Show markets"
            onClick={toggleMarkets}
          />
        ) : null}
        {desktop && smartOrdersCollapsed && !chartFullscreen ? (
          <PanelReopenTab
            side="right"
            label="Show smart orders"
            onClick={toggleSmartOrders}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  )

  const upper = desktop ? (
    <ResizablePanelGroup
      elementRef={horizontalGroupElementRef}
      groupRef={horizontalLayout.groupRef}
      orientation="horizontal"
      className="min-h-0 flex-1"
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="markets"
        panelRef={marketsPanelRef}
        collapsible
        collapsedSize="0%"
        // A reset returns the panel to the smallest useful width. The chart
        // takes every pixel left after both side panels claim their minimums.
        defaultSize="12%"
        minSize="12%"
        maxSize="30%"
        // A smaller window shrinks the chart, never this list. Without it every
        // panel gave up its share of the lost width, and the market list came
        // out of a half-width window too narrow to read.
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setMarketsCollapsed(size.asPercentage < 0.5)}
      >
        <div className="flex h-full min-h-0">{marketColumn}</div>
      </ResizablePanel>
      <ResizableHandle gap collapsed={marketsCollapsed} className={NO_RING} />
      <ResizablePanel id="chart" minSize="30%">
        {middle}
      </ResizablePanel>
      <ResizableHandle
        gap
        collapsed={smartOrdersCollapsed}
        className={NO_RING}
      />
      <ResizablePanel
        id="smart-orders"
        panelRef={smartOrdersPanelRef}
        collapsible
        collapsedSize="0%"
        // Keep reset and first-open width at the smallest usable size, just
        // like the market list. Omitting the chart default lets it fill the
        // exact remainder instead of stretching both side panels.
        defaultSize="18.5rem"
        minSize="18.5rem"
        maxSize="42%"
        // Same rule as the market list: the chart absorbs a window shrink.
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setSmartOrdersCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          collapsed={smartOrdersCollapsed}
          onDoubleClick={smartOrdersDoubleClick}
          className="flex min-h-0 flex-1 flex-col"
        >
          {smartOrdersPanel}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    middle
  )

  return (
    // One memory of which settings cards are folded, for every window under
    // here — the ladder window and a live ladder's exits both draw the same
    // cards, and folding one in one place should mean it is folded in both.
    <CardFolds initial={initialCardFolds}>
      <div
        data-chart-fullscreen={chartFullscreen ? "true" : undefined}
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          chartFullscreen &&
            "fixed inset-0 z-50 bg-background p-[var(--shell-gutter,0.75rem)]"
        )}
      >
        <ResizablePanelGroup
          elementRef={verticalGroupElementRef}
          groupRef={verticalLayout.groupRef}
          orientation="vertical"
          className="min-h-0 flex-1"
          onLayoutChanged={activityFit.onLayoutChanged}
        >
          <ResizablePanel id="workspace" defaultSize="72%" minSize="35%">
            <div className="flex h-full min-h-0">{upper}</div>
          </ResizablePanel>
          {/* Keeps its gap even while the panel below is collapsed — that
            collapsed tab row is still a panel on screen, and this handle is
            what makes it draggable back open. */}
          <ResizableHandle
            gap
            className={cn(NO_RING, chartFullscreen && "hidden")}
          />
          <ResizablePanel
            id="activity"
            panelRef={activityPanelRef}
            className={chartFullscreen ? "hidden" : undefined}
            defaultSize="28%"
            minSize="12%"
            maxSize="60%"
            // A shorter window shrinks the chart above, not this panel's rows.
            groupResizeBehavior="preserve-pixel-size"
            // Down to its own header rather than to nothing, so its tabs and
            // their counts never disappear.
            collapsible
            collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
          >
            <WorkspacePanel onDoubleClick={activityDoubleClick}>
              <ActivityPanel
                trading={trading}
                tab={activityTab}
                onTabChange={setActivityTab}
                catalogs={catalogs}
                wallets={account.wallets}
                onSelectMarket={onSelectMarket}
                onAddToPosition={addToPosition}
                canChangeLeverage={allowed(abilities?.changeLeverage)}
                leverageRefusal={refusalOf(abilities?.changeLeverage)}
                canAdjustMargin={allowed(abilities?.adjustMargin)}
                marginRefusal={refusalOf(abilities?.adjustMargin)}
                shownTrade={shownTrade}
                onShowTrade={showTrade}
                fit={activityFit}
              />
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Narrow screens keep the market itself as the page and reach the side
          panels through the two buttons in its header, rather than squeezing
          three columns into a width none of them fits in. */}
        <Sheet
          open={sideSheet.open}
          onOpenChange={(open) =>
            setSideSheet((current) => ({ ...current, open }))
          }
        >
          <SheetContent
            side={sideSheet.side === "smart-orders" ? "right" : "left"}
            className="duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none data-closed:ease-in data-[side=left]:data-closed:slide-out-to-left-full data-[side=right]:data-closed:slide-out-to-right-full"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>
                {sideSheet.side === "smart-orders" ? "Smart orders" : "Markets"}
              </SheetTitle>
            </SheetHeader>
            {sideSheet.side === "smart-orders" ? (
              <div className="flex min-h-0 flex-1">{smartOrdersPanel}</div>
            ) : (
              <div className="flex min-h-0 flex-1">{marketColumn}</div>
            )}
          </SheetContent>
        </Sheet>

        {/* One instance of each wallet window beside the shared account state. */}
        <AddWalletDialog
          protocol={protocol}
          open={addingWallet}
          onClose={() => setAddingWallet(false)}
          onAdded={(wallet) => {
            // Only when nothing was being traded with yet. Adding a second
            // wallet must never move the one an order would go to — that is a
            // switch, and switching is its own deliberate act.
            if (!account.activeWallet) account.switchWallet(wallet.id)
            void account.refresh()
          }}
        />
        <FlattenWalletDialog
          wallet={flattening}
          positions={trading.positions}
          smartOrders={trading.smartOrders}
          busy={trading.busy}
          onConfirm={(wallet) => {
            void trading.flattenWallet(wallet.id)
            setFlatteningId(null)
          }}
          onDismiss={() => setFlatteningId(null)}
        />
        <WalletDetailsDialog
          wallet={walletDetails}
          summary={walletDetails ? account.summaryOf(walletDetails.id) : null}
          positions={trading.positions}
          fallbackMarks={fallbackMarks}
          onClose={() => setWalletDetailsId(null)}
          onOpenWallet={(wallet) => setEditingWalletId(wallet.id)}
          onFlattenWallet={(wallet) => setFlatteningId(wallet.id)}
          onRetry={() => void account.refresh()}
        />
        <WalletSettingsDialog
          wallet={editingWallet}
          active={editingWallet?.id === account.activeWallet?.id}
          onClose={() => setEditingWalletId(null)}
          onChanged={() => void account.refresh()}
          onUse={account.switchWallet}
        />
      </div>
    </CardFolds>
  )
}

function editableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  )
}
