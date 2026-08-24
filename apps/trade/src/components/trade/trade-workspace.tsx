import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { AccountPanel } from "@/components/trade/account-panel"
import { ActivityPanel } from "@/components/trade/activity-panel"
import { SmartOrdersPanel } from "@/components/trade/smart-orders-panel"
import { useTrading } from "@/components/trade/use-trading"
import { useTradeAccount } from "@/components/trade/use-trade-account"
import {
  AddWalletDialog,
  WalletSettingsDialog,
} from "@/components/trade/wallet-dialogs"
import { ChartOptionsMenu } from "@/components/trade/chart-options-menu"
import { ChartPanel, IntervalPicker } from "@/components/trade/chart-panel"
import { IndicatorsMenu } from "@/components/trade/indicators-menu"
import { useChartOptions } from "@/components/trade/use-chart-options"
import {
  MarketHeader,
  type MarketSelection,
} from "@/components/trade/market-header"
import { CardFolds } from "@/components/trade/card-folds"
import type { CardFolds as CardFoldsValue } from "@/lib/trade/card-folds"
import { useChartIndicators } from "@/components/trade/use-indicators"
import { MarketFoldersPanel } from "@/components/trade/market-folders-panel"
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
} from "@/lib/api/market-folders"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  CANDLE_INTERVALS,
  parseMarketKey,
  type CandleInterval,
  type MarketRow,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
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
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { usePanelFit } from "@/lib/trade/panel-fit"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import { useRememberedPanelLayoutInPlace } from "@/lib/trade/panel-layout"
import type { QuickOrderPrefs } from "@/lib/trade/quick-order"
import {
  favFolder,
  type MarketFolder,
  type MarketFolderActions,
} from "@/lib/trade/market-folders"
import {
  marketWasHiddenByVolume,
  type FilteredMarketCatalog,
} from "@/lib/trade/market-volume"
import { useWideScreen } from "@/lib/layout/wide-screen"

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
  side: "markets" | "account"
  open: boolean
}

/**
 * What the picked key means against the full exchange answer and the visible
 * rows: a real market, nothing picked, one hidden by the volume setting, or a
 * well-formed key the exchange did not list. The last two stay distinct so an
 * account setting is never blamed on the exchange.
 */
function resolveSelection(
  catalogs: FilteredMarketCatalog[],
  selectedKey: string | null
): MarketSelection {
  if (!selectedKey) return { kind: "none" }
  const ref = parseMarketKey(selectedKey)
  if (!ref) return { kind: "none" }
  for (const catalog of catalogs) {
    const row = catalog.rows.find((candidate) => candidate.key === selectedKey)
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
  if (marketWasHiddenByVolume(catalogs, selectedKey)) {
    return { kind: "volume-hidden", marketId: ref.marketId }
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
  network,
  initialFolders,
  initialChartView,
  initialChartOptions,
  initialIndicators,
  initialCardFolds,
  initialQuickOrder,
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
  /** Which network the whole page is showing — resolved by the route. */
  network: NetworkId
  initialFolders: MarketFolder[]
  /** The zoom and scroll this account left the chart at. */
  initialChartView: ChartView | null
  /** Which supporting parts of the chart this account has visible. */
  initialChartOptions: ChartOptions
  /** Which indicators this account has on, and what each is set to. */
  initialIndicators: IndicatorSettings
  /** How the trading windows' settings cards were left folded. */
  initialCardFolds: CardFoldsValue
  /** How the right-click order window was last set up. */
  initialQuickOrder: QuickOrderPrefs
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
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)
  const [accountCollapsed, setAccountCollapsed] = React.useState(false)
  const [sideSheet, setSideSheet] = React.useState<SideSheet>({
    side: "markets",
    open: false,
  })

  // ----- Market folders: one exchange, optimistic item changes -------------
  const [folders, setFolders] = React.useState(initialFolders)
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

  // Memoised: the workspace re-renders on every poll and every price tick,
  // and a fresh answer each time made every panel below re-do its own work.
  const selection = React.useMemo(
    () => resolveSelection(catalogs, selectedKey),
    [catalogs, selectedKey]
  )

  // ----- Wallets: one owner, shared by the desktop column and the sheet ----
  const dashboardCacheScope = `${user.id}:${protocol}`
  const account = useTradeAccount(protocol, dashboardCacheScope)
  const walletsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const accountColumnRef = React.useRef<HTMLDivElement | null>(null)
  const [addingWallet, setAddingWallet] = React.useState(false)
  const [editingWalletId, setEditingWalletId] = React.useState<string | null>(
    null
  )
  // Resolved against the live list on every render, so a wallet deleted in
  // another tab closes its own window instead of editing a ghost.
  const editingWallet =
    account.wallets.find((wallet) => wallet.id === editingWalletId) ?? null

  const fitWalletRows = React.useCallback((height: number) => {
    const panel = walletsPanelRef.current
    const columnHeight = accountColumnRef.current?.clientHeight ?? 0
    if (!panel || columnHeight === 0) return
    // Keep at least 12% for Smart orders, matching its own panel minimum.
    panel.resize(`${Math.min(88, (height / columnHeight) * 100)}%`)
  }, [])

  // ----- Trading: one owner for the chart's lines and the panel ------------
  // Practice and real wallets flow through the same hook; it is the wallet a
  // row belongs to that decides which road an action takes.
  const trading = useTrading(account.activeWallet, protocol)
  const fallbackMarks = React.useMemo(
    () =>
      new Map(
        catalogs.flatMap((catalog) =>
          catalog.rows.map((market) => [market.key, market.price] as const)
        )
      ),
    [catalogs]
  )
  const accountPanel = (
    <AccountPanel
      account={account}
      positions={trading.positions}
      fallbackMarks={fallbackMarks}
      cacheScope={dashboardCacheScope}
      onAddWallet={() => setAddingWallet(true)}
      onOpenWallet={(wallet) => setEditingWalletId(wallet.id)}
      onContentHeightChange={fitWalletRows}
    />
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
  React.useEffect(() => {
    if (!tradingBusy) void refreshAccount()
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

  // The live feed: one watch per catalog, torn down with the page. When the
  // feed recovers from a gap it refetches the loader's snapshot, so figures
  // that moved during the outage do not linger.
  React.useEffect(
    () => startLiveMarketData(catalogs, onRetryMarkets),
    [catalogs, onRetryMarkets]
  )

  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const accountPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const activityPanelRef = React.useRef<PanelImperativeHandle | null>(null)

  const horizontalLayout = useRememberedPanelLayoutInPlace(
    tradePanelLayoutKey.workspaceHorizontal
  )
  const verticalLayout = useRememberedPanelLayoutInPlace(
    tradePanelLayoutKey.workspaceVertical
  )
  const accountColumnLayout = useRememberedPanelLayoutInPlace(
    tradePanelLayoutKey.accountColumn
  )

  // Pressing a tab in the bottom panel grows it to fit that tab's rows, through
  // the same resizable panel the divider drags. It also takes over saving the
  // vertical layout, because a grown height is never the remembered one.
  const activityFit = usePanelFit(
    activityPanelRef,
    verticalLayout.onLayoutChanged
  )

  const toggleMarkets = usePanelToggle(marketsPanelRef)
  const toggleAccount = usePanelToggle(accountPanelRef)
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
  }, [shrinkActivity])

  // Double-clicking the empty part of a panel shuts it, and double-clicking
  // what is left of it opens it again.
  const marketsDoubleClick = useBlankSpaceDoubleClick(toggleMarkets)
  const accountDoubleClick = useBlankSpaceDoubleClick(toggleAccount)
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

  const walletNameOf = React.useCallback(
    (walletId: string) =>
      trading.walletNames.get(walletId) ??
      account.wallets.find((wallet) => wallet.id === walletId)?.label ??
      "another wallet",
    [trading.walletNames, account.wallets]
  )

  // One panel now, not a market list above a folders panel: Watched is the
  // combined panel's first row and All markets its last (decided 23 Aug
  // 2026), so the column no longer splits vertically.
  const marketColumn = (
    <WorkspacePanel
      collapsed={marketsCollapsed}
      onDoubleClick={marketsDoubleClick}
      className="flex min-h-0 flex-1 flex-col"
    >
      <MarketFoldersPanel
        folders={folders}
        protocol={protocol}
        network={network}
        catalogs={catalogs}
        marketsError={marketsError}
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
        selectedMarketKey={selectedKey}
        onFoldersChange={setFolders}
        onSelectMarket={onSelectMarket}
        onRetryMarkets={onRetryMarkets}
      />
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
      for (const row of catalog.rows) byKey.set(row.key, row)
    }
    return byKey
  }, [catalogs])

  const middle = (
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and without
    // a width to fill it shrinks to its content.
    <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
      <MarketHeader
        selection={selection}
        markets={marketRows}
        folders={folders}
        folderActions={folderActions}
        onSelectMarket={onSelectMarket}
        // The chart's own controls live in the header row; they only make
        // sense once there is a market to chart. Indicators sit to the right
        // of the timeframe: which candles first, then what to draw on them.
        toolbar={
          selection.kind === "market" ? (
            <>
              <IntervalPicker value={interval} onChange={setInterval} />
              <IndicatorsMenu
                indicators={indicators}
                context={{ zone: chartOptions.options.zone, interval }}
              />
              <ChartOptionsMenu control={chartOptions} />
            </>
          ) : undefined
        }
        // On a wide screen both panels are already on screen, so the buttons
        // would only be a second way to do what the dividers already do.
        onOpenMarkets={
          desktop
            ? undefined
            : () => setSideSheet({ side: "markets", open: true })
        }
        onOpenAccount={
          desktop
            ? undefined
            : () => setSideSheet({ side: "account", open: true })
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <ChartPanel
            selectedKey={selectedKey}
            interval={interval}
            initialChartView={initialChartView}
            initialQuickOrder={initialQuickOrder}
            options={chartOptions.options}
            indicators={indicators.settings}
            market={selection.kind === "market" ? selection.row : null}
            trading={trading}
            free={free}
            equity={equity}
            shownTrade={shownTrade}
          />
        </div>
        {/* Shown where the panel disappeared, so getting it back is findable
            without remembering that the divider is still draggable. */}
        {desktop && marketsCollapsed ? (
          <PanelReopenTab
            side="left"
            label="Show markets"
            onClick={toggleMarkets}
          />
        ) : null}
        {desktop && accountCollapsed ? (
          <PanelReopenTab
            side="right"
            label="Show account"
            onClick={toggleAccount}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  )

  const upper = desktop ? (
    <ResizablePanelGroup
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
        // Three tabs now, and "Watched" is a wider word than the two it joined.
        // At 16% the tab row ran off its own edge and "All" was half a label.
        defaultSize="20%"
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
      <ResizablePanel id="chart" defaultSize="58%" minSize="30%">
        {middle}
      </ResizablePanel>
      <ResizableHandle gap collapsed={accountCollapsed} className={NO_RING} />
      <ResizablePanel
        id="account"
        panelRef={accountPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="22%"
        minSize="16%"
        maxSize="36%"
        // Same rule as the market list: the chart absorbs a window shrink.
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setAccountCollapsed(size.asPercentage < 0.5)}
      >
        {/* Two panels in this column, not one card inside another.

            A panel IS the card on this screen — its own rounded edges with a
            gap between it and the next. The automations were tucked inside the
            wallets' card for a build, which put a card inside a card and let
            the list grow to eight thousand pixels instead of scrolling.

            The lower one is empty on purpose. Every coin a switched-on flow is
            watching used to sit there and now has a page of its own; the space,
            its divider and the size you dragged it to are kept for whatever
            goes in next, rather than taken away and rebuilt later. */}
        <div ref={accountColumnRef} className="flex h-full min-h-0">
          <ResizablePanelGroup
            groupRef={accountColumnLayout.groupRef}
            orientation="vertical"
            className="min-h-0 flex-1"
            onLayoutChanged={accountColumnLayout.onLayoutChanged}
          >
            <ResizablePanel
              id="wallets"
              panelRef={walletsPanelRef}
              defaultSize="50%"
              minSize="52.4px"
            >
              <WorkspacePanel
                collapsed={accountCollapsed}
                onDoubleClick={accountDoubleClick}
              >
                {accountPanel}
              </WorkspacePanel>
            </ResizablePanel>
            <ResizableHandle gap className={NO_RING} />
            <ResizablePanel id="smart-orders" defaultSize="50%" minSize="12%">
              <WorkspacePanel
                collapsed={accountCollapsed}
                className="flex flex-col"
              >
                <SmartOrdersPanel
                  cacheScope={dashboardCacheScope}
                  smartOrders={trading.smartOrders}
                  positions={trading.positions}
                  fills={trading.fills}
                  trades={trading.trades}
                  markets={marketsByKey}
                  wallets={account.wallets}
                  walletName={walletNameOf}
                  // NOT `trading.loading`: that turns false when the practice
                  // half lands on its own, and a screen whose ladders are all on
                  // real wallets would say "none working" until the exchange
                  // answered.
                  settled={trading.settled}
                  failed={trading.failed}
                  onRetry={trading.retry}
                  onSelectMarket={onSelectMarket}
                />
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
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
      <div className="flex min-h-0 flex-1 flex-col">
        <ResizablePanelGroup
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
          <ResizableHandle gap className={NO_RING} />
          <ResizablePanel
            id="activity"
            panelRef={activityPanelRef}
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
                catalogs={catalogs}
                onSelectMarket={onSelectMarket}
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
            side={sideSheet.side === "account" ? "right" : "left"}
            className="duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none data-closed:ease-in data-[side=left]:data-closed:slide-out-to-left-full data-[side=right]:data-closed:slide-out-to-right-full"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>
                {sideSheet.side === "account" ? "Account" : "Markets"}
              </SheetTitle>
            </SheetHeader>
            {sideSheet.side === "account" ? (
              <div className="min-h-0 flex-1 [&_[data-slot=account-add-wallet]]:mr-9">
                {accountPanel}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1">{marketColumn}</div>
            )}
          </SheetContent>
        </Sheet>

        {/* One instance of each wallet window, owned here beside the one
          account state, so the sheet and the desktop column share them. */}
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
