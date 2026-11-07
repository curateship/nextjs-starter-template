import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import type { DashboardBootstrap } from "@/lib/api/trade/dashboard"
import {
  WalletDetailsDialog,
  WalletManagement,
} from "@/components/trade/account-panel"
import { DustSweepDialog } from "@/components/trade/dust-sweep-dialog"
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
import {
  SmartOrdersPanel,
  type SmartOrdersPanelKind,
} from "@/components/trade/smart-orders-panel"
import { ManualOrdersPanel } from "@/components/trade/manual-orders-panel"
import { useTrading } from "@/components/trade/use-trading"
import { useTradeAccount } from "@/components/trade/use-trade-account"
import {
  AddWalletDialog,
  WalletSettingsDialog,
} from "@/components/trade/wallet-dialogs"
import { ChartFullscreenButton } from "@/components/trade/chart-fullscreen-button"
import { ChartInvertButton } from "@/components/trade/chart-invert-button"
import {
  ChartPanel,
  IntervalPicker,
  type OlderBarsStatus,
} from "@/components/trade/chart-panel"
import { useChartOptions } from "@/components/trade/use-chart-options"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import {
  MarketInfoFacts,
  type MarketSelection,
} from "@/components/trade/market-header"
import { TestnetStrip } from "@/components/trade/market-list-panel"
import { MarketPicker } from "@/components/trade/market-picker"
import { MarketIcon } from "@/components/trade/market-icon"
import { ChartOptionsMenu } from "@/components/trade/chart-options-menu"
import { IndicatorsMenu } from "@/components/trade/indicators-menu"
import { CardFolds } from "@/components/trade/card-folds"
import type { CardFolds as CardFoldsValue } from "@/lib/trade/card-folds"
import { useChartIndicators } from "@/components/trade/use-indicators"
import { MarketScannerMenu } from "@/components/trade/market-scanner-panel"
import { MarketFoldersManager } from "@/components/trade/market-folders-manager"
import { MarketFoldersMenu } from "@/components/trade/market-folders-menu"
import { PriceAlertsMenu } from "@/components/trade/price-alerts-menu"
import { TradingRuleEditor } from "@/components/trade/trading-rules-settings"
import { useLineAlerts } from "@/components/trade/use-line-alerts"
import { usePriceAlerts } from "@/components/trade/use-price-alerts"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Button } from "@/components/ui/button"
import {
  createFolder,
  getMarketFolderErrorMessage,
  loadFolders as reloadFolders,
  setFolderMarket,
} from "@/lib/api/trade/market-folders"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  marketSymbol,
  parseMarketKey,
  protocolLabel,
  type MarketRow,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  DashboardCardHeader,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import type { TradePosition } from "@/lib/trade/paper"
import type { ChartOptions } from "@/lib/trade/chart-options"
import {
  showsRulesChartCard,
  type TradingRules,
} from "@/lib/trade/trading-rules"
import type { ChartView } from "@/lib/trade/chart-view"
import type { IndicatorSettings } from "@/lib/trade/indicators/registry"
import type { LiveTrade } from "@/lib/trade/live-trades"
import { useChartInterval } from "@/lib/trade/use-chart-interval"
import { chartSourceInterval } from "@/lib/trade/chart-interval"
import { startLiveMarketData } from "@/lib/trade/live-market"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { tradePanelIds, tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import {
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
import { useIsMobile } from "@/hooks/use-mobile"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { cn } from "@/lib/utils"
import {
  ExchangePageMenu,
  MarketPageMenu,
} from "@/components/trade/notes/page-menus"
import {
  TradeBlocksProvider,
  type TradeBlocks,
} from "@/components/trade/notes/trade-block-views"
import {
  TradePageBody,
  useTradePage,
} from "@/components/trade/notes/trade-page-panel"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageCover } from "@/components/trade/notes/page-cover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PanelLeftCloseIcon, PanelRightCloseIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { DashboardCore } from "@/lib/api/trade/dashboard"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { PANEL_GUTTER } from "@/lib/trade/panel-gutter"
import { STILL_PANEL } from "@/lib/trade/panel-fit"
import {
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"
import { EXCHANGE_PAGE_MARKET } from "@/lib/trade/trade-pages"

/**
 * No focus ring on a panel divider.
 *
 * The shell's divider draws one when it has keyboard focus, which is a line
 * the full height of the app appearing the moment any key goes down. Merged
 * last, so it beats the shell's own class without editing a shell file.
 */
const NO_RING = "focus-visible:ring-0"
/** The middle panel's tabs, in the order they sit. */
const MIDDLE_TABS: readonly ActivityTab[] = [
  "chart",
  "positions",
  "orders",
  "journal",
]

/** Who is signed in, read the way the shell's own pages read it. */
const authenticatedRoute = getRouteApi("/_authenticated")

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
  initialTradingRules,
  initialIndicators,
  initialCardFolds,
  initialQuickOrder,
  initialPanelLayouts,
  initialPages,
  initialWallets,
  selectedKey,
  onSelectMarket,
  onRetryMarkets,
  onSearchMarkets,
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
  /** The rules checked before a real-money entry, from the same answer. */
  initialTradingRules: TradingRules
  /** Which indicators this account has on, and what each is set to. */
  initialIndicators: IndicatorSettings
  /** How the trading windows' settings cards were left folded. */
  initialCardFolds: CardFoldsValue
  /** How the right-click order window was last set up. */
  initialQuickOrder: QuickOrderPrefs
  /** Divider positions owned by this account. */
  initialPanelLayouts: TradePanelLayouts
  /** The exchange's page and the remembered market's page, from the same answer. */
  initialPages: DashboardCore["pages"]
  /** The account panel's first answer from the same opening call. */
  initialWallets: DashboardBootstrap["wallets"]
  /** The picked market's key, carried in the address bar. */
  selectedKey: string | null
  onSelectMarket: (key: string) => void
  onRetryMarkets: () => void
  /** The venue's lookup for a market outside the list, where it has one. */
  onSearchMarkets?: (query: string) => Promise<MarketRow[]>
}) {
  // Known before the first render on both sides, so the page opens in the
  // layout it is going to keep instead of painting the phone version and
  // rebuilding itself a beat later.
  const { user } = authenticatedRoute.useLoaderData()
  const desktop = useWideScreen()
  // A phone: Browse market shows its magnifier alone.
  const phone = useIsMobile()
  // Under 1280px the three panels show one at a time behind a pill row (the
  // Admin 3 panel design, 7 Nov 2026), opening on the chart.
  const [narrowView, setNarrowView] = React.useState<
    "blocks" | "chart" | "market"
  >("chart")
  // Memoised: the workspace re-renders on every poll and every price tick,
  // and a fresh answer each time made every panel below re-do its own work.
  const selection = React.useMemo(
    () => resolveSelection(catalogs, selectedKey),
    [catalogs, selectedKey]
  )
  const [blocksCollapsed, setBlocksCollapsed] = React.useState(false)
  const [marketCollapsed, setMarketCollapsed] = React.useState(false)

  // ----- Market folders: one exchange, optimistic item changes -------------
  const [folders, setFolders] = React.useState(initialFolders)
  // Where All markets sits and whether it shows.
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
  const walletButtonRef = React.useRef<HTMLButtonElement>(null)
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
  const [sweepingId, setSweepingId] = React.useState<string | null>(null)
  const sweeping =
    account.wallets.find((wallet) => wallet.id === sweepingId) ?? null

  // ----- Trading: one owner for the chart's lines and the panel ------------
  // Practice and real wallets flow through the same hook; it is the wallet a
  // row belongs to that decides which road an action takes.
  /**
   * Which bottom tab is showing, owned here because two things need it: the
   * panel draws it, and the poll uses it to decide whether the Journal's
   * trade history is worth asking the exchange for at all.
   */
  // The middle panel's tab: the chart, Positions, Open orders or the Journal.
  // Remembered in this browser, opening on the chart the first time.
  const [activityTab, setActivityTab] = useRememberedChoice<ActivityTab>(
    "trade-dashboard-middle-tab",
    "chart",
    MIDDLE_TABS
  )
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
  const summaryOfWallet = account.summaryOf
  const equityOfWallet = React.useCallback(
    (walletId: string) => {
      const summary = summaryOfWallet(walletId)
      return summary?.state === "ok" ? summary.equity : null
    },
    [summaryOfWallet]
  )

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
  // fetch read the same choice, and remembered against this exchange alone.
  const [interval, setInterval] = useChartInterval(protocol)

  // The indicators, owned here for the same reason: the header's menu switches
  // them on and the chart below draws them, so both have to be reading one
  // answer. They belong to the account rather than to the market, exactly like
  // the zoom — an indicator is how you read a chart, not a fact about a coin.
  const indicators = useChartIndicators(initialIndicators)
  const chartOptions = useChartOptions(initialChartOptions)
  const priceAlerts = usePriceAlerts(initialPriceAlerts)
  const lineAlerts = useLineAlerts()
  // The line a panel row asked for, until the chart has picked it out.
  const [drawingToSelect, setDrawingToSelect] = React.useState<{
    marketKey: string
    id: string
  } | null>(null)
  const [folderManagerOpen, setFolderManagerOpen] = React.useState(false)
  const onSelectLine = React.useCallback(
    (marketKey: string, id: string) => {
      onSelectMarket(marketKey)
      setDrawingToSelect({ marketKey, id })
    },
    [onSelectMarket]
  )
  const onDrawingSelected = React.useCallback(
    () => setDrawingToSelect(null),
    []
  )
  // Not memoised: the panel is not a memo component, and the list object
  // behind this is new on every render anyway.
  const linesForPanel = {
    armed: lineAlerts.armed,
    fired: lineAlerts.fired,
    error: lineAlerts.error,
    onRetry: () => void lineAlerts.refresh(),
    onSelect: onSelectLine,
    onSwitchOff: lineAlerts.switchOff,
  }
  const refreshPriceAlerts = priceAlerts.refresh
  const refreshLineAlerts = lineAlerts.refresh
  const onAlertsCleared = React.useCallback(
    async () =>
      void (await Promise.all([refreshPriceAlerts(), refreshLineAlerts()])),
    [refreshLineAlerts, refreshPriceAlerts]
  )

  // The live feed: one watch per catalog, torn down with the page. When the
  // feed recovers from a gap it refetches the loader's snapshot, so figures
  // that moved during the outage do not linger.
  React.useEffect(
    () => startLiveMarketData(catalogs, onRetryMarkets),
    [catalogs, onRetryMarkets]
  )

  const blocksPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const marketPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalGroupElementRef = React.useRef<HTMLDivElement | null>(null)

  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)
  const horizontalKey = tradePanelLayoutKey.workspaceHorizontal
  const horizontalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[horizontalKey],
    panelLayouts.layouts.current[horizontalKey],
    (layout) => panelLayouts.remember(horizontalKey, layout)
  )
  const [chartFullscreen, setChartFullscreen] = React.useState(false)
  const fullscreenLayout = React.useRef<ReturnType<
    typeof horizontalLayout.getLayout
  > | null>(null)
  const restoreFullscreenLayouts = React.useRef(false)

  const enterChartFullscreen = React.useCallback(() => {
    if (selection.kind !== "market") return
    restoreFullscreenLayouts.current = false
    fullscreenLayout.current = horizontalLayout.getLayout()
    // Full screen is the chart: the middle panel's chart tab, both pages away.
    setActivityTab("chart")
    horizontalLayout.setLayout({ blocks: 0, chart: 100, market: 0 })
    setChartFullscreen(true)
  }, [horizontalLayout, selection.kind, setActivityTab])

  const exitChartFullscreen = React.useCallback(() => {
    restoreFullscreenLayouts.current = true
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
      const before = fullscreenLayout.current
      fullscreenLayout.current = null
      if (before) horizontalLayout.setLayout(before)
    }
    const horizontal = horizontalGroupElementRef.current
    if (typeof ResizeObserver !== "undefined" && horizontal) {
      const observer = new ResizeObserver(() => {
        observer.disconnect()
        restore()
      })
      observer.observe(horizontal)
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
  }, [chartFullscreen, horizontalLayout.setLayout])

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

  const toggleBlocksPanel = usePanelToggle(blocksPanelRef)
  const toggleBlocks = React.useCallback(() => {
    toggleBlocksPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleBlocksPanel])
  const toggleMarketPanel = usePanelToggle(marketPanelRef)
  const toggleMarket = React.useCallback(() => {
    toggleMarketPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleMarketPanel])

  // Double-clicking the empty part of a side panel shuts it, and
  // double-clicking what is left of it opens it again.
  const blocksDoubleClick = useBlankSpaceDoubleClick(toggleBlocks)
  const marketDoubleClick = useBlankSpaceDoubleClick(toggleMarket)

  // The finished trade drawn on the chart, picked in the Journal. It lives up
  // here because two panels share it: the table below decides which one, and
  // the chart above draws it. Picking one in another market also switches the
  // chart to that market — otherwise the row would look broken.
  const [shownTrade, setShownTrade] = React.useState<LiveTrade | null>(null)
  /**
   * Where the chart's older bars came from, reported by the chart panel
   * from its own fetch. Kept with the market-and-interval it is about, so a
   * report that lands after a switch is simply not shown.
   */
  const [olderBars, setOlderBars] = React.useState<OlderBarsStatus | null>(null)
  const olderBarsAbout =
    olderBars &&
    selectedKey &&
    olderBars.key === `${selectedKey}@${chartSourceInterval(interval)}`
      ? olderBars
      : null
  // Whose history the chart is drawing, on a venue that has none of its own.
  // Quiet, beside the market name, and never on a venue drawing its own bars.
  const borrowedNote = olderBarsAbout?.borrowedNote ? (
    <span className="hidden text-xs text-muted-foreground md:inline">
      {olderBarsAbout.borrowedNote}
    </span>
  ) : null
  const olderBarsNote =
    olderBars &&
    selectedKey &&
    olderBars.key === `${selectedKey}@${chartSourceInterval(interval)}` ? (
      olderBars.failed ? (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground md:inline-flex">
          Older bars could not all be loaded.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={olderBars.retry}
          >
            Try again
          </Button>
        </span>
      ) : null
    ) : null
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
    const giveUp = window.setTimeout(() => {
      showErrorToast(
        `Could not open the order window for ${marketSymbol(adding.marketKey)}. Pick the market and try again.`
      )
      setAdding(null)
    }, 5_000)
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

  // The Rules box is drawn by the chart into the Rules block on the
  // exchange's page (the Admin 3 panel design, 7 Nov 2026). With no Rules
  // block on the page, or the page's panel shut, the card over the chart sums
  // the rules up instead, unless Settings, Trading rules switched it off.
  const [rulesSlot, setRulesSlot] = React.useState<HTMLElement | null>(null)
  // The rules as edited from the Rules box's cog, so the box and the entry
  // check follow an edit at once rather than after a reload.
  const [tradingRules, setTradingRules] = React.useState(initialTradingRules)
  const [editingRuleId, setEditingRuleId] = React.useState<string | null>(null)

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
  // Every market, the ones under the volume cutoff included. Manual orders
  // prices its holdings from this, and a held coin is still held when its day
  // was quiet: PONS on KuCoin traded $892k one day against a $1M cutoff and its
  // row lost its value and profit (Tyler, 4 Nov 2026).
  const everyMarketRow = React.useMemo(
    () => [...marketsByKey.values()],
    [marketsByKey]
  )

  // Picking a market from a block shows the chart on a narrow screen, where
  // the blocks and the chart are not on screen together.
  const pickMarket = React.useCallback(
    (key: string) => {
      onSelectMarket(key)
      setNarrowView("chart")
      setActivityTab("chart")
    },
    [onSelectMarket, setActivityTab]
  )

  // Grids and DCA ladders are two blocks, fed the same read.
  const smartOrderPanel = (kind: SmartOrdersPanelKind) => (
    <SmartOrdersPanel
      kind={kind}
      key={`${protocol}:${kind}`}
      bare
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
      onSelectMarket={pickMarket}
    />
  )

  // What each block on the two pages draws. Every one is the panel that used
  // to sit in its own column or behind a header button, with the same reads.
  const tradeBlocks: TradeBlocks = {
    setRulesSlot,
    grid: smartOrderPanel("grid"),
    dca: smartOrderPanel("dca"),
    manual: (
      <ManualOrdersPanel
        bare
        orders={trading.watchOrders}
        positions={trading.positions}
        smartOrders={trading.smartOrders}
        markets={everyMarketRow}
        cacheScope={`${user.id}:${protocol}`}
        refusals={trading.refusals}
        walletName={walletNameOf}
        settled={trading.settled}
        failed={trading.failed}
        onRetry={trading.retry}
        onSelectMarket={pickMarket}
        selectedKey={selectedKey}
      />
    ),
    alerts: (
      <PriceAlertsMenu
        alerts={priceAlerts.alerts}
        error={priceAlerts.error}
        onRetry={() => void priceAlerts.refresh()}
        onSelectMarket={pickMarket}
        onDelete={priceAlerts.remove}
        lines={linesForPanel}
        onCleared={onAlertsCleared}
      />
    ),
    scanner: (
      <MarketScannerMenu
        accountId={user.id}
        key={user.id}
        catalogs={catalogs}
        selectedMarketKey={selectedKey}
        onSelectMarket={pickMarket}
      />
    ),
    folders: (
      <MarketFoldersMenu
        panelRows={panelRows}
        marketsError={marketsError}
        marketsPending={marketsPending}
        onRetryMarkets={onRetryMarkets}
        folders={folders}
        protocol={protocol}
        network={network}
        catalogs={catalogs}
        selectedMarketKey={selectedKey}
        onFoldersChange={setFolders}
        onManage={() => setFolderManagerOpen(true)}
        onSelectMarket={pickMarket}
      />
    ),
    marketInfo:
      selection.kind === "market" ? (
        <MarketInfoFacts selection={selection} />
      ) : null,
  }

  // The two pages: the exchange's own, and the market's on the chart.
  const exchangePage = useTradePage({
    protocol,
    marketKey: EXCHANGE_PAGE_MARKET,
    initial: { marketKey: EXCHANGE_PAGE_MARKET, page: initialPages.exchange },
  })
  const pageMarketKey = selection.kind === "market" ? selection.row.key : null
  const marketPage = useTradePage({
    protocol,
    marketKey: pageMarketKey,
    initial: initialPages.market
      ? {
          marketKey: initialPages.market.marketKey,
          page: {
            body: initialPages.market.body,
            locked: initialPages.market.locked,
            coverUrl: initialPages.market.coverUrl,
          },
        }
      : null,
  })

  // The left panel: the exchange's own page of blocks, under its name and My
  // settings. The folder manager takes the page's place while it is open, the
  // way the Inbox does in Project, and the page stays mounted under it.
  const blocksColumn = (
    <WorkspacePanel
      onDoubleClick={blocksDoubleClick}
      className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col"
    >
      {/* Wrapped so the shell's header-over-a-table rule never matches: the
          tables inside the blocks below set it off, and the header then drew
          a table's line instead of its own Divider lines line (Tyler, 7 Nov
          2026: "this left panel header divider is not wired to the styling
          setting"). */}
      <PageCover url={exchangePage.cover.url} />
      <div className="relative shrink-0">
        <DashboardCardHeader
          // Over a cover the line goes see-through, as on Project's pages.
          className={cn(exchangePage.cover.url && "border-b-transparent")}
        >
          {/* Shuts the left panel, as a double-click on its blank space does
              (Tyler, 7 Nov 2026: "add a collasible icon here to collapse the
              left panel"). The slim tab at the chart's edge brings it back. */}
          {desktop ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Hide the blocks"
                  className="-ml-1 shrink-0 rounded-lg"
                  onClick={toggleBlocks}
                >
                  <PanelLeftCloseIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Hide the blocks</TooltipContent>
            </Tooltip>
          ) : null}
          <span className={cn("min-w-0 flex-1 truncate", dashboardCardHeadingClassName)}>
            {protocolLabel(protocol)}
          </span>
          <ExchangePageMenu lock={exchangePage.lock} cover={exchangePage.cover} />
        </DashboardCardHeader>
      </div>
      {folderManagerOpen ? (
        <MarketFoldersManager
          folders={folders}
          protocol={protocol}
          network={network}
          catalogs={catalogs}
          marketsError={marketsError}
          marketsPending={marketsPending}
          panelRows={panelRows}
          onFoldersChange={setFolders}
          onPanelRowsChange={setPanelRows}
          manageOpen={folderManagerOpen}
          onManageOpenChange={setFolderManagerOpen}
        />
      ) : null}
      <ScrollArea
        className={cn("relative min-h-0 flex-1", folderManagerOpen && "hidden")}
      >
        <div className={cn(PANEL_GUTTER, "pt-0")}>
          <TradePageBody page={exchangePage} marketKey={EXCHANGE_PAGE_MARKET} />
        </div>
      </ScrollArea>
    </WorkspacePanel>
  )

  // The right panel: the market's own page, under its name and the market's
  // ⋮, which holds its folders and Pin to top.
  const marketColumn = (
    <WorkspacePanel
      onDoubleClick={marketDoubleClick}
      className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col"
    >
      <PageCover url={pageMarketKey ? marketPage.cover.url : null} />
      {/* Wrapped for the same reason as the left panel's header. */}
      <div className="relative shrink-0">
      <DashboardCardHeader
        className={cn(pageMarketKey && marketPage.cover.url && "border-b-transparent")}
      >
        {/* The market's own icon before its name (Tyler, 7 Nov 2026: "Add the
            market favicon"), a first-letter circle where the exchange has
            no art. */}
        {/* 16px in from the panel's edge, where the left panel's first icon
            and this panel's own collapse icon sit (Tyler, 7 Nov 2026:
            "padding is not consistence"). */}
        {selection.kind === "market" ? (
          <span className="ml-1 flex shrink-0">
            <MarketIcon
              symbol={selection.row.symbol}
              iconUrl={selection.row.iconUrl}
            />
          </span>
        ) : null}
        <span className={cn("min-w-0 flex-1 truncate", dashboardCardHeadingClassName)}>
          {selection.kind === "market" ? selection.row.symbol : "No market"}
        </span>
        <MarketPageMenu
          marketKey={pageMarketKey}
          folders={folders}
          folderActions={folderActions}
          lock={marketPage.lock}
          cover={marketPage.cover}
        />
        {/* Shuts the right panel, at its outer edge as the left panel's
            button is at its own (Tyler, 7 Nov 2026: "add a collapsible icon
            here"). The slim tab at the chart's edge brings it back. */}
        {desktop ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Hide the market"
                className="-mr-1 shrink-0 rounded-lg"
                onClick={toggleMarket}
              >
                <PanelRightCloseIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hide the market</TooltipContent>
          </Tooltip>
        ) : null}
      </DashboardCardHeader>
      </div>
      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn(PANEL_GUTTER, "pt-0")}>
          {pageMarketKey ? (
            <TradePageBody page={marketPage} marketKey={pageMarketKey} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Pick a market to see its page.
            </p>
          )}
        </div>
      </ScrollArea>
    </WorkspacePanel>
  )

  // The chart's controls sit in the middle panel's one header, beside its
  // tabs (Tyler, 7 Nov 2026: "There should only be one middle header"): the
  // timeframe, Indicators and View options. Browse market leads the header. The wallet is a row
  // in that header's ⋮. Narrow, the timeframe shows only the one picked.
  const chartControls = (narrowHeader: boolean) => (
    <>
      <IntervalPicker
        phone={narrowHeader}
        value={interval}
        onChange={setInterval}
      />
      <IndicatorsMenu
        indicators={indicators}
        context={{ zone: chartOptions.options.zone, interval }}
      />
      <ChartOptionsMenu control={chartOptions} />
    </>
  )

  // Where the chart's older bars came from, said quietly over the chart's top
  // left now that there is no market row to say it in.
  const chartNote =
    borrowedNote || olderBarsNote ? (
      <div className="pointer-events-none absolute top-2 left-3 z-10 flex items-center gap-2 [&_button]:pointer-events-auto">
        {borrowedNote}
        {olderBarsNote}
      </div>
    ) : null

  const chart = (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {selection.kind === "market" &&
      parseMarketKey(selection.row.key)?.network === "testnet" ? (
        <TestnetStrip />
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        {chartNote}
        <div className="min-h-0 flex-1">
          <ChartPanel
            selectedKey={selectedKey}
            interval={interval}
            initialChartView={initialChartView}
            initialChart={initialChart}
            chartToolbarPosition={panelLayouts.layouts.chartToolbarPosition}
            onChartToolbarPositionChange={
              panelLayouts.rememberChartToolbarPosition
            }
            initialDrawings={initialDrawings}
            onDrawingAlertChange={lineAlerts.refresh}
            lineAlertsPaused={lineAlerts.paused}
            onExtendPreference={chartOptions.setExtendTrendlines}
            onBufferPreference={chartOptions.setLineAlertBuffer}
            onAlertPreference={chartOptions.setLineAlertsOn}
            selectDrawing={drawingToSelect}
            onDrawingSelected={onDrawingSelected}
            priceAlerts={priceAlerts.alerts}
            onCreatePriceAlert={priceAlerts.create}
            onMovePriceAlert={priceAlerts.move}
            onDeletePriceAlert={priceAlerts.remove}
            initialQuickOrder={initialQuickOrder}
            recentOrderScope={user.id}
            options={chartOptions.options}
            tradingRules={tradingRules}
            onEditRule={setEditingRuleId}
            indicators={indicators.settings}
            market={selection.kind === "market" ? selection.row : null}
            trading={trading}
            free={free}
            equity={equity}
            equityOfWallet={equityOfWallet}
            shownTrade={shownTrade}
            onClearShownTrade={() => setShownTrade(null)}
            onOlderBars={setOlderBars}
            // The Rules block on the exchange's page, while that page is on
            // screen.
            rulesSlot={
              chartFullscreen || (desktop && blocksCollapsed) ? null : rulesSlot
            }
            rulesCard={
              (chartFullscreen ||
                (desktop && blocksCollapsed) ||
                rulesSlot === null) &&
              showsRulesChartCard(tradingRules)
            }
            cornerControl={
              <div className="flex items-center gap-2">
                <ChartInvertButton
                  active={chartOptions.options.invert}
                  onToggle={() =>
                    chartOptions.setOption(
                      "invert",
                      !chartOptions.options.invert
                    )
                  }
                />
                <ChartFullscreenButton
                  active={chartFullscreen}
                  onToggle={toggleChartFullscreen}
                />
              </div>
            }
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
        {/* Shown where a side panel disappeared, so getting it back is
            findable without remembering that the divider still drags. */}
        {desktop && blocksCollapsed && !chartFullscreen ? (
          <PanelReopenTab
            side="left"
            label="Show blocks"
            onClick={toggleBlocks}
          />
        ) : null}
        {desktop && marketCollapsed && !chartFullscreen ? (
          <PanelReopenTab
            side="right"
            label="Show market"
            onClick={toggleMarket}
          />
        ) : null}
      </div>
    </div>
  )

  // The middle panel: the chart and the three tables as tabs (Tyler, 7 Nov
  // 2026: "[marketname chart][positions][journal]", with Open orders kept as
  // a tab of its own). In full screen only the chart shows, with its header,
  // and it is the same chart, never drawn again.
  const middle = (
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and without
    // a width to fill it shrinks to its content.
    <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
      <ActivityPanel
          trading={trading}
          tab={activityTab}
          onTabChange={setActivityTab}
          catalogs={catalogs}
          wallets={account.wallets}
          onSelectMarket={onSelectMarket}
          onAddToPosition={(position) => {
            setActivityTab("chart")
            addToPosition(position)
          }}
          canChangeLeverage={allowed(abilities?.changeLeverage)}
          leverageRefusal={refusalOf(abilities?.changeLeverage)}
          canAdjustMargin={allowed(abilities?.adjustMargin)}
          marginRefusal={refusalOf(abilities?.adjustMargin)}
          shownTrade={shownTrade}
          onShowTrade={(trade) => {
            showTrade(trade)
            if (trade) setActivityTab("chart")
          }}
          fit={STILL_PANEL}
          chart={{
            label:
              selection.kind === "market"
                ? `${selection.row.symbol} chart`
                : "Chart",
            content: chart,
            only: chartFullscreen,
          }}
          controls={chartControls}
          // The primary Browse market button, at the header's start before
          // the tabs (Tyler, 7 Nov 2026: "make it primary and put it here").
          lead={
            <>
      {selection.kind === "market" ? (
        <MarketPicker
          phone={phone}
          key={protocol}
          rows={marketRows}
          selected={selection.row}
          capabilities={selection.picker}
          folders={folders}
          folderActions={folderActions}
          onSelect={pickMarket}
          venueLabel={selection.protocolLabel}
          onSearchBeyond={onSearchMarkets}
        />
      ) : null}
            </>
          }
          wallet={{
            name: account.activeWallet?.label ?? null,
            menu: (trigger) => (
              <WalletManagement
                walletButtonRef={walletButtonRef}
                account={account}
                cacheScope={dashboardCacheScope}
                detailsOpen={walletDetails !== null}
                onAddWallet={() => setAddingWallet(true)}
                onOpenWalletDetails={(wallet) => setWalletDetailsId(wallet.id)}
                trigger={trigger}
              />
            ),
          }}
        />
    </WorkspacePanel>
  )

  // Under 1280px: one panel at a time behind a pill row, opening on the chart.
  const narrow = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Tabs
        value={narrowView}
        onValueChange={(value) => setNarrowView(value as typeof narrowView)}
      >
        <TabsList>
          <TabsTrigger value="blocks">Blocks</TabsTrigger>
          <TabsTrigger value="chart">
            {selection.kind === "market" ? selection.row.symbol : "Chart"}
          </TabsTrigger>
          <TabsTrigger value="market">Market</TabsTrigger>
        </TabsList>
      </Tabs>
      {(
        [
          ["blocks", blocksColumn],
          ["chart", middle],
          ["market", marketColumn],
        ] as const
      ).map(([side, content]) => (
        <div
          key={side}
          className={
            narrowView === side || (side === "chart" && chartFullscreen)
              ? "flex min-h-0 min-w-0 flex-1 flex-col"
              : "hidden"
          }
          inert={narrowView !== side && !(side === "chart" && chartFullscreen)}
        >
          {content}
        </div>
      ))}
    </div>
  )

  const panels = desktop ? (
    <ResizablePanelGroup
      elementRef={horizontalGroupElementRef}
      groupRef={horizontalLayout.groupRef}
      orientation="horizontal"
      className="min-h-0 flex-1"
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="blocks"
        panelRef={blocksPanelRef}
        collapsible
        collapsedSize="0%"
        // Each side panel opens at its narrowest, 16%, and drags to 36%; the
        // middle takes the rest (the Admin 3 panel design).
        defaultSize="16%"
        minSize="16%"
        maxSize="36%"
        // A smaller window shrinks the chart, never the page beside it.
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setBlocksCollapsed(size.asPercentage < 0.5)}
      >
        <div className="flex h-full min-h-0">{blocksColumn}</div>
      </ResizablePanel>
      <ResizableHandle gap collapsed={blocksCollapsed} className={NO_RING} />
      <ResizablePanel id="chart" minSize="32%">
        {middle}
      </ResizablePanel>
      <ResizableHandle gap collapsed={marketCollapsed} className={NO_RING} />
      <ResizablePanel
        id="market"
        panelRef={marketPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="16%"
        minSize="16%"
        maxSize="36%"
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setMarketCollapsed(size.asPercentage < 0.5)}
      >
        <div className="flex h-full min-h-0">{marketColumn}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    narrow
  )

  return (
    // One memory of which settings cards are folded, for every window under
    // here — the ladder window and a live ladder's exits both draw the same
    // cards, and folding one in one place should mean it is folded in both.
    <CardFolds initial={initialCardFolds}>
      <TradeBlocksProvider value={tradeBlocks}>
        <div
          data-chart-fullscreen={chartFullscreen ? "true" : undefined}
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            chartFullscreen &&
              "fixed inset-0 z-50 bg-background p-[var(--shell-gutter,0.75rem)]"
          )}
        >
          {panels}

        {editingRuleId ? (
          <TradingRuleEditor
            rules={tradingRules}
            ruleId={editingRuleId}
            onRulesChange={setTradingRules}
            onClose={() => setEditingRuleId(null)}
          />
        ) : null}

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
          walletButtonRef={walletButtonRef}
          wallet={walletDetails}
          summary={walletDetails ? account.summaryOf(walletDetails.id) : null}
          positions={trading.positions}
          fallbackMarks={fallbackMarks}
          onClose={() => setWalletDetailsId(null)}
          onOpenWallet={(wallet) => setEditingWalletId(wallet.id)}
          onFlattenWallet={(wallet) => setFlatteningId(wallet.id)}
          onSweepLeftovers={(wallet) => setSweepingId(wallet.id)}
          onRetry={() => void account.refresh()}
        />
        <DustSweepDialog
          wallet={sweeping}
          markets={marketsByKey}
          onClose={() => setSweepingId(null)}
          onSwept={() => void account.refresh()}
        />
        <WalletSettingsDialog
          wallet={editingWallet}
          active={editingWallet?.id === account.activeWallet?.id}
          onClose={() => setEditingWalletId(null)}
          onChanged={() => void account.refresh()}
          onUse={account.switchWallet}
        />
        </div>
      </TradeBlocksProvider>
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
