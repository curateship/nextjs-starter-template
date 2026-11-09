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
import { ChartOptionsMenu } from "@/components/trade/chart-options-menu"
import { IndicatorsMenu } from "@/components/trade/indicators-menu"
import { CardFolds } from "@/components/trade/card-folds"
import type { CardFolds as CardFoldsValue } from "@/lib/trade/card-folds"
import { useChartIndicators } from "@/components/trade/use-indicators"
import { MarketScannerMenu } from "@/components/trade/market-scanner-panel"
import {
  FoldersBlockMenuRows,
  MarketFoldersMenu,
} from "@/components/trade/market-folders-menu"
import { PriceAlertsMenu } from "@/components/trade/price-alerts-menu"
import { TradingRuleEditor } from "@/components/trade/trading-rules-settings"
import { useLineAlerts } from "@/components/trade/use-line-alerts"
import { usePriceAlerts } from "@/components/trade/use-price-alerts"
import { useFiredPriceAlerts } from "@/components/trade/price-alerts-panel"
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
  FoldersMenuRow,
  PinMenuRow,
} from "@/components/trade/notes/page-menus"
import {
  TradeBlocksProvider,
  type TradeBlocks,
} from "@/components/trade/notes/trade-block-views"
import {
  TradePageBody,
  type TradePage,
} from "@/components/trade/notes/trade-page-panel"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageCover } from "@/components/shared/notes/page-cover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  InfoIcon,
  PanelLeftCloseIcon,
  PanelLeftDashedIcon,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { PANEL_GUTTER } from "@/lib/trade/panel-gutter"
import { STILL_PANEL } from "@/lib/trade/panel-fit"
import {
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"

/**
 * No focus ring on a panel divider.
 *
 * The shell's divider draws one when it has keyboard focus, which is a line
 * the full height of the app appearing the moment any key goes down. Merged
 * last, so it beats the shell's own class without editing a shell file.
 */
const NO_RING = "focus-visible:ring-0"
const NO_SLOTS: readonly HTMLElement[] = []
const NO_HIDDEN_BLOCKS: ReadonlySet<string> = new Set()

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
 * The Trade dashboard at `/trade` (8 Nov 2026): the left page of blocks, with
 * the Protocols block that picks what the middle shows, and the middle, which
 * is Overview's widgets or the picked exchange's chart and tables. There is
 * no right panel (Tyler: "I dont want a right panel").
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
  initialWallets,
  page,
  pageMenu,
  protocolsBlock,
  protocolsMenu,
  hideEmptyBlocks,
  overview,
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
  /**
   * The left page, one per person, held above this workspace so it carries
   * on unchanged when the exchange changes.
   */
  page: TradePage
  /**
   * The ⋮ over the left page: General, Widgets and Alerts. Handed the alerts
   * list, which this workspace reads.
   */
  pageMenu: (parts: { alerts: React.ReactNode }) => React.ReactNode
  /** What the Protocols block draws: Overview and the exchanges. */
  protocolsBlock: React.ReactNode
  /** The Protocols block's ⋮ rows: each exchange's eye. */
  protocolsMenu: React.ReactNode
  /** "Hide empty blocks" from the page's ⋮: empty trade blocks leave the page. */
  hideEmptyBlocks: boolean
  /**
   * Overview's widgets while Overview is picked, drawn in the middle's place
   * with no panel of their own; null while an exchange is picked. The chart
   * stays mounted under it, so going back to the exchange never reloads it.
   */
  overview: React.ReactNode | null
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
  // Under 1280px the two panels show one at a time behind a pill row: Page,
  // and the picked row's name (Tyler, 8 Nov 2026: "Page and the middle").
  const [narrowView, setNarrowView] = React.useState<"blocks" | "chart">(
    "chart"
  )
  const showingOverview = overview !== null
  // Memoised: the workspace re-renders on every poll and every price tick,
  // and a fresh answer each time made every panel below re-do its own work.
  const selection = React.useMemo(
    () => resolveSelection(catalogs, selectedKey),
    [catalogs, selectedKey]
  )
  const [blocksCollapsed, setBlocksCollapsed] = React.useState(false)

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
  // Read here, not in the Alerts tab, so the tab shows them at once each time
  // it opens; the list refreshes itself every two seconds while visible.
  const firedAlerts = useFiredPriceAlerts()
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
    // Overview has no chart on screen to make full screen.
    if (selection.kind !== "market" || showingOverview) return
    restoreFullscreenLayouts.current = false
    fullscreenLayout.current = horizontalLayout.getLayout()
    // Full screen is the chart: the middle panel's chart tab, the page away.
    setActivityTab("chart")
    horizontalLayout.setLayout({ blocks: 0, chart: 100 })
    setChartFullscreen(true)
  }, [horizontalLayout, selection.kind, setActivityTab, showingOverview])

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

  // Double-clicking the empty part of the left panel shuts it, and
  // double-clicking what is left of it opens it again.
  const blocksDoubleClick = useBlankSpaceDoubleClick(toggleBlocks)

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

  // The Rules box is drawn by the chart into every Rules block on screen, on
  // the exchange's page and on the market's (the Admin 3 panel design, 7 Nov
  // 2026). With none on screen, the card over the chart sums the rules up
  // instead, unless Settings, Trading rules switched it off.
  const [rulesSlots, setRulesSlots] = React.useState<readonly HTMLElement[]>([])
  const addRulesSlot = React.useCallback((element: HTMLElement) => {
    setRulesSlots((slots) => [...slots, element])
    return () => setRulesSlots((slots) => slots.filter((one) => one !== element))
  }, [])
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

  // Which trade blocks have nothing to show, each told by its own panel,
  // which alone knows what it lists. Kept by block name.
  const [emptyBlocks, setEmptyBlocks] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const emptyReporters = React.useMemo(() => {
    const report = (block: string) => (empty: boolean) =>
      setEmptyBlocks((was) => {
        if (was.has(block) === empty) return was
        const next = new Set(was)
        if (empty) next.add(block)
        else next.delete(block)
        return next
      })
    return {
      grid: report("grid-trades"),
      dca: report("dca-trades"),
      manual: report("manual-trades"),
    }
  }, [])

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
      onEmptyChange={emptyReporters[kind]}
    />
  )

  // The alerts, fired and waiting: a tab of the page's ⋮ since 8 Nov 2026,
  // not a block (Tyler: "Put the alerts archive here and remove the alert
  // block. We already have these alert in the notification tray").
  const alertsArchive = (
    <PriceAlertsMenu
      fired={firedAlerts}
      alerts={priceAlerts.alerts}
      error={priceAlerts.error}
      onRetry={() => void priceAlerts.refresh()}
      onSelectMarket={pickMarket}
      onDelete={priceAlerts.remove}
      lines={linesForPanel}
      onCleared={onAlertsCleared}
    />
  )

  // What each block on the two pages draws. Every one is the panel that used
  // to sit in its own column or behind a header button, with the same reads.
  const tradeBlocks: TradeBlocks = {
    addRulesSlot,
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
        onEmptyChange={emptyReporters.manual}
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
    protocols: protocolsBlock,
    protocolsMenu,
    hidden: hideEmptyBlocks ? emptyBlocks : NO_HIDDEN_BLOCKS,
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
        onPanelRowsChange={setPanelRows}
        managing={folderManagerOpen}
        onManagingChange={setFolderManagerOpen}
        onSelectMarket={pickMarket}
      />
    ),
    foldersMenu: (
      <FoldersBlockMenuRows
        protocol={protocol}
        network={network}
        folders={folders}
        onFoldersChange={setFolders}
        onManage={() => setFolderManagerOpen(true)}
      />
    ),
  }

  // The left panel: the dashboard's page of blocks, under its name and its
  // ⋮. Manage folders opens as a popover beside the Folders block.
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
      <PageCover url={page.cover.url} />
      <div className="relative shrink-0">
        <DashboardCardHeader
          // Over a cover the line goes see-through, as on Project's pages.
          className={cn(page.cover.url && "border-b-transparent")}
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
            Trade
          </span>
          {pageMenu({ alerts: alertsArchive })}
        </DashboardCardHeader>
      </div>
      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn(PANEL_GUTTER, "pt-0")}>
          <TradePageBody page={page} />
        </div>
      </ScrollArea>
    </WorkspacePanel>
  )

  // The chart's controls sit in the middle panel's one header, beside its
  // tabs (Tyler, 7 Nov 2026: "There should only be one middle header"): the
  // Browse market, the timeframe, Indicators and View options. The wallet is a row
  // in that header's ⋮. Narrow, the timeframe shows only the one picked.
  const chartControls = (narrowHeader: boolean) => (
    <>
      {/* The primary Browse market button, on the header's right just before
          the timeframes (Tyler, 8 Nov 2026: "move the brwose market button
          here"; it led the header from 7 Nov). */}
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

  // A Rules block counts while its page is on screen: not in full screen,
  // and not while the left panel is shut on a wide screen.
  const shownRulesSlots =
    chartFullscreen || (desktop && blocksCollapsed) ? NO_SLOTS : rulesSlots

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
            // Every Rules block whose page is on screen.
            rulesSlots={shownRulesSlots}
            rulesCard={
              shownRulesSlots.length === 0 && showsRulesChartCard(tradingRules)
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
      </div>
    </div>
  )

  // The market's facts, in a tooltip on the "i" inside the chart tab, after
  // the market's name (Tyler, 8 Nov 2026: "for the market info, just add the
  // tooltip beside market ticker on the middle tab"). A tab is itself a
  // button, so the "i" is not a second one inside it: pointing at it shows
  // the facts, and a press on it stays the "i"'s, never the tab's.
  const marketInfo =
    selection.kind === "market" ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={`About ${selection.row.symbol} market`}
            data-market-info=""
            className="-mr-1 ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <InfoIcon className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="p-0">
          <MarketInfoFacts selection={selection} />
        </TooltipContent>
      </Tooltip>
    ) : null

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
            info: marketInfo,
            content: chart,
            only: chartFullscreen,
          }}
          // The shut left panel comes back from the header's start, as on the
          // shell's dashboards (Tyler, 8 Nov 2026: "put the uncollapse here
          // like how shell does it"), in place of the slim tab on the edge.
          lead={
            desktop && blocksCollapsed && !chartFullscreen ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Show the page"
                    className="-ml-1 shrink-0 rounded-lg"
                    onClick={toggleBlocks}
                  >
                    <PanelLeftDashedIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show the page</TooltipContent>
              </Tooltip>
            ) : null
          }
          menuRows={
            selection.kind === "market" ? (
              <>
                <FoldersMenuRow
                  marketKey={selection.row.key}
                  folders={folders}
                  actions={folderActions}
                />
                <PinMenuRow marketKey={selection.row.key} />
              </>
            ) : null
          }
          controls={chartControls}
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

  // Overview in the middle's place: the widgets straight on the dashboard,
  // with no panel of their own, as the shell's Admin Overview. The chart and
  // its tables stay mounted under it, out of sight. The knob at the edge
  // brings the shut left panel back, as on the chart.
  const middleOrOverview = (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {showingOverview ? (
        <div data-trade-overview="" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {overview}
          {desktop && blocksCollapsed ? (
            <PanelReopenTab side="left" label="Show blocks" onClick={toggleBlocks} />
          ) : null}
        </div>
      ) : null}
      <div
        className={showingOverview ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}
        inert={showingOverview}
      >
        {middle}
      </div>
    </div>
  )

  // Under 1280px: one panel at a time behind a pill row, opening on the
  // middle: Page, and the picked row's name.
  const narrow = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Tabs
        value={narrowView}
        onValueChange={(value) => setNarrowView(value as typeof narrowView)}
      >
        <TabsList>
          <TabsTrigger value="blocks">Page</TabsTrigger>
          <TabsTrigger value="chart">
            {showingOverview
              ? "Overview"
              : selection.kind === "market"
                ? selection.row.symbol
                : "Chart"}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {(
        [
          ["blocks", blocksColumn],
          ["chart", middleOrOverview],
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
        // The left panel opens at its narrowest, 15.2%, 5% narrower than the
        // design's 16% (Tyler, 8 Nov 2026: "shrink the left side panel 5%
        // narrower"), and drags to 36%; the
        // middle takes the rest (the Admin 3 panel design).
        defaultSize="15.2%"
        minSize="15.2%"
        maxSize="36%"
        // A smaller window shrinks the chart, never the page beside it.
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setBlocksCollapsed(size.asPercentage < 0.5)}
      >
        <div className="flex h-full min-h-0">{blocksColumn}</div>
      </ResizablePanel>
      <ResizableHandle gap collapsed={blocksCollapsed} className={NO_RING} />
      <ResizablePanel id="chart" minSize="32%">
        {middleOrOverview}
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
