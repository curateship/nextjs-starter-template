import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import {
  BookOpenIcon,
  ChartNoAxesCombinedIcon,
  CreditCardIcon,
  EyeIcon,
  FolderIcon,
  LayersIcon,
  ScrollTextIcon,
  SirenIcon,
} from "lucide-react"

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
import {
  SmartOrdersPanel,
  type SmartOrdersPanelKind,
} from "@/components/trade/smart-orders-panel"
import { SmartOrdersMenu } from "@/components/trade/smart-orders-menu"
import { ManualOrdersPanel } from "@/components/trade/manual-orders-panel"
import { useTrading } from "@/components/trade/use-trading"
import { useTradeAccount } from "@/components/trade/use-trade-account"
import {
  AddWalletDialog,
  WalletSettingsDialog,
} from "@/components/trade/wallet-dialogs"
import { ChartFullscreenButton } from "@/components/trade/chart-fullscreen-button"
import { ChartInvertButton } from "@/components/trade/chart-invert-button"
import { ChartToolsMenu } from "@/components/trade/chart-tools-menu"
import {
  ChartPanel,
  IntervalPicker,
  type OlderBarsStatus,
} from "@/components/trade/chart-panel"
import { useChartOptions } from "@/components/trade/use-chart-options"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import {
  MarketHeader,
  MarketInfoRow,
  type MarketSelection,
} from "@/components/trade/market-header"
import {
  MarketPhoneMenu,
  PhoneMenuRow,
} from "@/components/trade/market-phone-menu"
import { PinnedMarketRow } from "@/components/trade/pinned-market-button"
import { ChartOptionsMenu } from "@/components/trade/chart-options-menu"
import { IndicatorsMenu } from "@/components/trade/indicators-menu"
import { indicatorsOn } from "@/lib/trade/indicators/registry"
import { useIsMobile } from "@/hooks/use-mobile"
import { CardFolds } from "@/components/trade/card-folds"
import type { CardFolds as CardFoldsValue } from "@/lib/trade/card-folds"
import { useChartIndicators } from "@/components/trade/use-indicators"
import { MarketScannerPanel } from "@/components/trade/market-scanner-panel"
import { MarketFoldersManager } from "@/components/trade/market-folders-manager"
import { MarketFoldersMenu } from "@/components/trade/market-folders-menu"
import { PriceAlertsMenu } from "@/components/trade/price-alerts-menu"
import { useLineAlerts } from "@/components/trade/use-line-alerts"
import { usePriceAlerts } from "@/components/trade/use-price-alerts"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Button } from "@/components/ui/button"
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
import type { TradingRules } from "@/lib/trade/trading-rules"
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
import { STILL_PANEL, usePanelFit } from "@/lib/trade/panel-fit"
import { tradePanelIds, tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import {
  marketPanelScopeKey,
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"
import { hidePnlNow } from "@/lib/trade/hide-pnl"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import {
  ALL_ROW,
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
/**
 * The Grid and DCA panels inside the collapsed-column menu: as tall as their
 * own rows, capped at half the menu less Manual orders' 9rem, with a line
 * above each one that has a panel on screen above it.
 */
const POPOVER_SMART_PANEL_CLASS =
  "flex max-h-[calc((min(44rem,var(--radix-popover-content-available-height))-9rem)/2)] min-h-0 flex-none flex-col [:not([hidden])~&]:border-t"

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
  initialTradingRules,
  initialIndicators,
  initialCardFolds,
  initialQuickOrder,
  initialPanelLayouts,
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
  /** Divider positions and named arrangements owned by this account. */
  initialPanelLayouts: TradePanelLayouts
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
  // A phone, which is narrower again than the point the side panels fold away
  // at. The market header goes down to one row there and the bottom panel
  // leaves the screen, both of them reachable from the header's three dots.
  const phone = useIsMobile()
  // Which table the three dots opened over the chart, or null for none.
  const [phoneActivity, setPhoneActivity] = React.useState(false)
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
  // Hide on empty, from View options (Tyler, 8 Oct 2026): an order panel with
  // no row to show leaves the column, so a long Grid list is not squeezed by
  // two empty cards. Each panel says whether it is empty, because only the
  // panel knows what it is listing: the smart-order panels read a cache before
  // the server answers, and Manual orders counts a coin held by hand as a row.
  // A hidden panel stays mounted, only unseen, so it can say when it has a row
  // again.
  const hideEmptyOrderPanels = chartOptions.options.hideEmptyOrderPanels
  const [emptyPanels, setEmptyPanels] = React.useState({
    grid: false,
    dca: false,
    manual: false,
  })
  const reportEmpty = React.useMemo(() => {
    const report =
      (panel: keyof typeof emptyPanels) => (empty: boolean) =>
        setEmptyPanels((current) =>
          current[panel] === empty ? current : { ...current, [panel]: empty }
        )
    return { grid: report("grid"), dca: report("dca"), manual: report("manual") }
  }, [])
  const panelHidden = (panel: keyof typeof emptyPanels) =>
    hideEmptyOrderPanels && emptyPanels[panel]
  const allOrderPanelsHidden =
    panelHidden("grid") && panelHidden("dca") && panelHidden("manual")
  // The column's spare height goes to the lowest panel still on screen.
  // Manual orders took it before Hide on empty existed; with Manual orders
  // hidden, a Grid panel on its own stopped at its rows and left the rest of
  // the column blank (Tyler, 8 Oct 2026).
  const lowestOrderPanel = !panelHidden("manual")
    ? "manual"
    : !panelHidden("dca")
      ? "dca"
      : "grid"
  const orderPanelGrowth = (panel: keyof typeof emptyPanels) =>
    lowestOrderPanel === panel ? "flex-[1_1_auto]" : "flex-[0_1_auto]"
  const noOrderPanelsNote = (
    <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Nothing is working or waiting. Grid, DCA and Manual orders come back
      when an order is placed.
    </p>
  )
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

  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const smartOrdersPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const activityPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalGroupElementRef = React.useRef<HTMLDivElement | null>(null)
  const verticalGroupElementRef = React.useRef<HTMLDivElement | null>(null)

  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)
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
    : ALL_ROW
  const horizontalKey = tradePanelLayoutKey.workspaceHorizontal
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
      const vertical = verticalLayout.getLayout()
      if (!horizontal || !vertical) {
        throw new Error("PANEL_LAYOUT_INVALID")
      }
      await panelLayouts.createNamed(
        name,
        horizontal,
        vertical,
        marketPanelScope,
        expandedMarketRowId,
        // A saved layout records whether profit was on show when it was made,
        // and applying it puts that back.
        !hidePnlNow(),
        panelLayouts.layouts.chartToolbarPosition
      )
    },
    [
      expandedMarketRowId,
      horizontalLayout,
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
  // The same rule for the phone's sliding table, on the phone line rather than
  // the wide one. Leaving it set would pop the table open, unasked, the next
  // time the window narrowed.
  const [lastPhone, setLastPhone] = React.useState(phone)
  if (phone !== lastPhone) {
    setLastPhone(phone)
    setPhoneActivity(false)
  }

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

  // The left column is only market navigation. Hand-placed orders live with
  // the other order controls in the right column.
  const marketColumn = (
    <WorkspacePanel
      collapsed={marketsCollapsed}
      onDoubleClick={marketsDoubleClick}
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
    >
      <MarketScannerPanel
        accountId={user.id}
        key={user.id}
        catalogs={catalogs}
        selectedMarketKey={selectedKey}
        onSelectMarket={onSelectMarket}
      />
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
    </WorkspacePanel>
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
      walletButtonRef={walletButtonRef}
      account={account}
      cacheScope={dashboardCacheScope}
      detailsOpen={walletDetails !== null}
      onAddWallet={() => setAddingWallet(true)}
      onOpenWalletDetails={(wallet) => setWalletDetailsId(wallet.id)}
    />
  )

  // Grids and DCA ladders are two panels, Grid above DCA (Tyler, 6 Oct 2026),
  // fed the same read.
  const smartOrderPanel = (kind: SmartOrdersPanelKind) => (
    <SmartOrdersPanel
      kind={kind}
      key={`${protocol}:${kind}`}
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
      onEmptyChange={reportEmpty[kind]}
    />
  )
  const gridPanel = smartOrderPanel("grid")
  const dcaPanel = smartOrderPanel("dca")

  const manualOrdersPanel = (
    <ManualOrdersPanel
      orders={trading.watchOrders}
      positions={trading.positions}
      smartOrders={trading.smartOrders}
      markets={marketRows}
      cacheScope={`${user.id}:${protocol}`}
      refusals={trading.refusals}
      walletName={walletNameOf}
      settled={trading.settled}
      failed={trading.failed}
      onRetry={trading.retry}
      onSelectMarket={onSelectMarket}
      selectedKey={selectedKey}
      onEmptyChange={reportEmpty.manual}
    />
  )

  // Each panel starts at the height its own rows need. When the column has
  // room to spare, Manual orders takes it, so no card ends in empty space
  // above another that scrolls. When it is short, all three give up height in
  // proportion to what they hold, so an empty Manual orders hands its room to
  // a long Grid list instead of holding a blank box (Tyler, 6 Oct 2026). The
  // floors keep each one's header and a row or its empty message on screen.
  const orderPanels = (
    <div
      data-order-panels
      className="flex h-full min-h-0 flex-col gap-(--shell-gutter)"
    >
      <WorkspacePanel
        hidden={panelHidden("grid")}
        className={cn(
          "flex h-auto min-h-32 flex-col",
          orderPanelGrowth("grid")
        )}
      >
        {gridPanel}
      </WorkspacePanel>
      <WorkspacePanel
        hidden={panelHidden("dca")}
        className={cn("flex h-auto min-h-32 flex-col", orderPanelGrowth("dca"))}
      >
        {dcaPanel}
      </WorkspacePanel>
      <WorkspacePanel
        hidden={panelHidden("manual")}
        className={cn(
          "flex h-auto min-h-44 flex-col",
          orderPanelGrowth("manual")
        )}
      >
        {manualOrdersPanel}
      </WorkspacePanel>
      {/* With every panel hidden the column would be a blank strip, which
          reads as a page that broke rather than a choice that worked. */}
      {allOrderPanelsHidden ? (
        <WorkspacePanel className="flex flex-1 flex-col">
          {noOrderPanelsNote}
        </WorkspacePanel>
      ) : null}
    </div>
  )

  // Everything the phone's market row has no space for, in the order the row
  // used to hold it: the chart's own two menus first, then the market's.
  //
  // The controls in here are the real ones, handed a line to be opened by
  // instead of their icon button, so nothing about what they do is written
  // twice. The three tables at the end are the bottom panel, which is not on a
  // phone screen at all — pressing one slides it up over the chart.
  const phoneMenu = !phone ? null : (
    <MarketPhoneMenu>
      <IndicatorsMenu
        indicators={indicators}
        context={{ zone: chartOptions.options.zone, interval }}
        trigger={
          <PhoneMenuRow
            icon={<ChartNoAxesCombinedIcon />}
            label="Indicators"
            detail={
              indicatorsOn(indicators.settings)
                ? String(indicatorsOn(indicators.settings))
                : undefined
            }
          />
        }
      />
      <ChartOptionsMenu
        control={chartOptions}
        trigger={<PhoneMenuRow icon={<EyeIcon />} label="View options" />}
      />
      <WalletManagement
        walletButtonRef={walletButtonRef}
        account={account}
        cacheScope={dashboardCacheScope}
        detailsOpen={walletDetails !== null}
        onAddWallet={() => setAddingWallet(true)}
        onOpenWalletDetails={(wallet) => setWalletDetailsId(wallet.id)}
        trigger={<PhoneMenuRow icon={<CreditCardIcon />} label="Wallet" />}
      />
      <PriceAlertsMenu
        alerts={priceAlerts.alerts}
        error={priceAlerts.error}
        onRetry={() => void priceAlerts.refresh()}
        onSelectMarket={onSelectMarket}
        onDelete={priceAlerts.remove}
        lines={linesForPanel}
        onCleared={onAlertsCleared}
        renderTrigger={(firedCount) => (
          <PhoneMenuRow
            icon={<SirenIcon />}
            label="Alerts"
            count={firedCount}
          />
        )}
      />
      {selection.kind === "market" ? (
        <PinnedMarketRow marketKey={selection.row.key} />
      ) : null}
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
        onManage={() => {
          setSideSheet({ side: "markets", open: true })
          setFolderManagerOpen(true)
        }}
        onSelectMarket={onSelectMarket}
        trigger={<PhoneMenuRow icon={<FolderIcon />} label="Watchlists" />}
      />
      {selection.kind === "market" ? (
        <MarketInfoRow selection={selection} />
      ) : null}
      <div aria-hidden className="my-1 border-t" />
      <PhoneMenuRow
        icon={<LayersIcon />}
        label="Positions"
        onClick={() => {
          setActivityTab("positions")
          setPhoneActivity(true)
        }}
      />
      <PhoneMenuRow
        icon={<ScrollTextIcon />}
        label="Open orders"
        onClick={() => {
          setActivityTab("orders")
          setPhoneActivity(true)
        }}
      />
      <PhoneMenuRow
        icon={<BookOpenIcon />}
        label="Journal"
        onClick={() => {
          setActivityTab("journal")
          setPhoneActivity(true)
        }}
      />
    </MarketPhoneMenu>
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
          marketAction={
            <div className="flex shrink-0 items-center gap-2">
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
                onManage={() => {
                  if (!desktop) {
                    setSideSheet({ side: "markets", open: true })
                  }
                  setFolderManagerOpen(true)
                }}
                onSelectMarket={onSelectMarket}
              />
              <PriceAlertsMenu
                alerts={priceAlerts.alerts}
                error={priceAlerts.error}
                onRetry={() => void priceAlerts.refresh()}
                onSelectMarket={onSelectMarket}
                onDelete={priceAlerts.remove}
                lines={linesForPanel}
                onCleared={onAlertsCleared}
              />
            </div>
          }
          // The chart's own controls live in the header row. The timeframe
          // stays one press away; less frequent choices share the three-dot
          // menu before the wallet. Full screen lives on the chart itself.
          note={
            borrowedNote || olderBarsNote ? (
              <span className="flex items-center gap-2">
                {borrowedNote}
                {olderBarsNote}
              </span>
            ) : null
          }
          onSearchBeyond={onSearchMarkets}
          toolbar={
            <>
              <IntervalPicker value={interval} onChange={setInterval} />
              <ChartToolsMenu
                indicators={indicators}
                indicatorContext={{
                  zone: chartOptions.options.zone,
                  interval,
                }}
                chartOptions={chartOptions}
                layouts={
                  desktop && !chartFullscreen
                    ? {
                        rows: panelLayouts.layouts.named,
                        activeId: panelLayouts.layouts.activeNamedId,
                        onCreate: createNamedLayout,
                        onApply: applyNamedLayout,
                        onDelete: panelLayouts.deleteNamed,
                      }
                    : undefined
                }
              />
              {walletManagement}
              {desktop && smartOrdersCollapsed && !chartFullscreen ? (
                <SmartOrdersMenu>
                  {/* Grid and DCA are as tall as their own rows and Manual
                      orders takes the rest. A fixed share each meant four
                      rows showed under a menu with empty space below it.
                      Grid and DCA split all but 9rem between them, so long
                      lists cannot squeeze Manual orders down to its heading.
                      Unlike the docked column, an empty Manual orders does
                      not hand its share to Grid here. A flex column rather
                      than a three-row grid, so a panel hidden by Hide on
                      empty leaves no row behind it. */}
                  <div className="flex max-h-[min(44rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden">
                    {/* The `hidden` attribute rather than the class: the
                        reset gives the attribute display none with priority,
                        so it beats each wrapper's own flex. The line above a
                        panel is drawn only when a panel is on screen above
                        it, so a hidden one leaves no stray line behind. */}
                    <div
                      hidden={panelHidden("grid")}
                      className={POPOVER_SMART_PANEL_CLASS}
                    >
                      {gridPanel}
                    </div>
                    <div
                      hidden={panelHidden("dca")}
                      className={POPOVER_SMART_PANEL_CLASS}
                    >
                      {dcaPanel}
                    </div>
                    <div
                      hidden={panelHidden("manual")}
                      className="flex min-h-0 flex-1 flex-col [:not([hidden])~&]:border-t"
                    >
                      {manualOrdersPanel}
                    </div>
                    {allOrderPanelsHidden ? noOrderPanelsNote : null}
                  </div>
                </SmartOrdersMenu>
              ) : null}
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
          phoneToolbar={
            phone ? (
              <IntervalPicker phone value={interval} onChange={setInterval} />
            ) : null
          }
          phoneMenu={phoneMenu}
        />
      ) : (
        // No market on the chart yet — a fresh visit, or an exchange with no
        // market list. The wallets still have to be reachable: on Solana a
        // wallet is made and funded before the market list exists at all, and
        // the wallet control lives in this row, so the row is drawn with the
        // exchange's name where the market would be.
        <DashboardCardHeader>
          <span className={dashboardCardHeadingClassName}>
            {protocolLabel(protocol)}
          </span>
          <div className="ml-auto shrink-0">{walletManagement}</div>
        </DashboardCardHeader>
      )}
      <div className="relative flex min-h-0 flex-1">
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
            tradingRules={initialTradingRules}
            indicators={indicators.settings}
            market={selection.kind === "market" ? selection.row : null}
            trading={trading}
            free={free}
            equity={equity}
            equityOfWallet={equityOfWallet}
            shownTrade={shownTrade}
            onClearShownTrade={() => setShownTrade(null)}
            onOlderBars={setOlderBars}
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
        {/* Shown where the panel disappeared, so getting it back is findable
            without remembering that the divider is still draggable. Both
            edges carry one: the orders panel had only the menu in the chart
            header, which says what is in the panel but never that the panel
            itself can come back. */}
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
            label="Show orders"
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
        {smartOrdersCollapsed ? null : (
          <div
            onDoubleClick={smartOrdersDoubleClick}
            className="flex h-full min-h-0 flex-col"
          >
            {orderPanels}
          </div>
        )}
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
        {/* A phone gets the chart and nothing under it. The tables are a
          screen's worth of columns each, and sharing 844 points of height
          with them left the chart too short to read a candle on. They open
          over the chart from the market row's three dots instead. */}
        {phone ? (
          <div className="flex min-h-0 flex-1">{upper}</div>
        ) : (
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
        )}

        {/* The bottom panel on a phone: the same tables, over the chart,
          opened by their line in the market row's three dots. The panel keeps
          its own tabs inside, so the other two tables are one press away
          without going back to the menu. */}
        {phone ? (
          <Sheet open={phoneActivity} onOpenChange={setPhoneActivity}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              // The height is written against the side, because the sheet's own
              // `h-auto` for a bottom sheet is the more specific rule and wins
              // over a plain height. `svh` is the small viewport height, which
              // is the phone screen with its address bar showing — the one
              // height that never changes as the bar slides away.
              // The tab row slides sideways rather than painting over Close
              // all beside it. Three words and a count are wider than a phone,
              // and the row's own box already shrinks to fit — it just had
              // nothing telling it to keep its tabs inside.
              className="gap-0 overflow-hidden rounded-t-2xl p-0 duration-150 ease-out data-[side=bottom]:h-[85svh] motion-reduce:animate-none motion-reduce:transition-none [&_[data-slot=tabs-list]]:overflow-x-auto"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Positions, open orders and journal</SheetTitle>
              </SheetHeader>
              {/* The same grab bar as the market menu, and the same way back:
                  the chart above it closes the sheet. */}
              <div
                aria-hidden
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
              />
              <ActivityPanel
                trading={trading}
                tab={activityTab}
                onTabChange={setActivityTab}
                catalogs={catalogs}
                wallets={account.wallets}
                // Both of these put something on the chart, and the chart is
                // behind this sheet, so the sheet goes.
                onSelectMarket={(key) => {
                  onSelectMarket(key)
                  setPhoneActivity(false)
                }}
                onAddToPosition={addToPosition}
                canChangeLeverage={allowed(abilities?.changeLeverage)}
                leverageRefusal={refusalOf(abilities?.changeLeverage)}
                canAdjustMargin={allowed(abilities?.adjustMargin)}
                marginRefusal={refusalOf(abilities?.adjustMargin)}
                shownTrade={shownTrade}
                onShowTrade={(trade) => {
                  showTrade(trade)
                  setPhoneActivity(false)
                }}
                fit={STILL_PANEL}
              />
            </SheetContent>
          </Sheet>
        ) : null}

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
                {sideSheet.side === "smart-orders"
                  ? "Smart and manual orders"
                  : "Markets"}
              </SheetTitle>
            </SheetHeader>
            {sideSheet.side === "smart-orders" ? (
              <div className="flex min-h-0 flex-1">{orderPanels}</div>
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
          walletButtonRef={walletButtonRef}
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
