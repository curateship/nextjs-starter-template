import * as React from "react"
import { Loader2Icon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { formatPrice } from "@nktkas/hyperliquid/utils"

import {
  AccountStrip,
  AccountSummaryPanel,
  type AccountSummary,
  type WalletOption,
} from "@/components/trading/account-strip"
import {
  FillsTable,
  OpenOrdersTable,
  PositionsTable,
} from "@/components/trading/bottom-tables"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ChartOrderMenu,
  type ChartMenuState,
} from "@/components/trading/chart-order-menu"
import { MarketWatchlist } from "@/components/trading/market-watchlist"
import { OrderBook } from "@/components/trading/order-book"
import { OrderTicket, type TicketPrefill } from "@/components/trading/order-ticket"
import { OneClickMenuActions } from "@/components/trading/one-click-panel"
import {
  PaperFillsTable,
  PaperOpenOrdersTable,
  PaperPositionsTable,
} from "@/components/trading/paper-bottom-tables"
import {
  PriceChart,
  type ChartPriceLine,
  type PriceChartHandle,
} from "@/components/chart/price-chart"
import { ChartToolbar } from "@/components/chart/chart-toolbar"
import { TradesTape } from "@/components/trading/trades-tape"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  cancelOrder,
  getOrderErrorMessage,
  modifyOrder,
} from "@/lib/api/orders"
import {
  getPaperErrorMessage,
  loadPaperAccount,
  movePaperOrder,
  type PaperAccountResponse,
} from "@/lib/api/paper"
import type { PaperWalletItem } from "@/lib/api/paper"
import type { WalletItem } from "@/lib/api/wallets"
import { formatCompactUsd, formatPriceDisplay } from "@/components/trading/format"
import {
  useAllMids,
  useMarketRows,
  useAccountSnapshot,
  type MarketRow,
} from "@/lib/hl/hooks"
import {
  resolveTradingNetwork,
  type TradingNetwork,
} from "@/lib/hl/network"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import {
  indicatorDisplayName,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"
import { saveIndicator } from "@/lib/api/indicators"
import { OverlaySettingsDialog } from "@/components/indicators/indicator-settings-dialog"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { usePersistedLayout } from "@/lib/use-persisted-layout"
import { usePersistedState } from "@/lib/use-persisted-state"
import { cn } from "@/lib/utils"
import {
  describeOpenOrder,
  type FrontendOpenOrder,
} from "@/lib/trading/open-order"

export const PAPER_WALLET_PREFIX = "paper:"

// Bottom-panel tabs share the backtest workspace's underline styling: active
// tabs are marked by an underline instead of a filled box.
const BOTTOM_TABS_LIST =
  "h-auto w-full justify-start gap-4 rounded-none border-b bg-transparent px-4 py-0"
const BOTTOM_TAB_TRIGGER =
  "flex-none rounded-none border-none px-0 py-2.5 text-xs font-semibold group-data-horizontal/tabs:after:bottom-0"

export function TradingWorkspace({
  network,
  wallets,
  paperWallets,
  market,
  selectedValue,
  workerOnline,
  initialIndicators,
  orderConfirmation,
  onMarketChange,
  onWalletChange,
}: {
  network: TradingNetwork
  wallets: WalletItem[]
  paperWallets: PaperWalletItem[]
  market: string
  /** Sandbox wallet id, or `paper:<id>` for in-house paper wallets. */
  selectedValue: string | null
  workerOnline?: boolean
  /** The user's overlay-indicator settings from the route loader (DB-backed). */
  initialIndicators: IndicatorConfig[]
  orderConfirmation: boolean
  onMarketChange: (coin: string) => void
  onWalletChange: (value: string) => void
}) {
  // Remembers the last-used timeframe across visits instead of a fixed 4h.
  const [interval, setInterval] = usePersistedState<CandleInterval>(
    "trading-interval",
    "4h",
    (raw) => {
      const value = JSON.parse(raw) as CandleInterval
      return CANDLE_INTERVALS.includes(value) ? value : "4h"
    }
  )
  const [prefill, setPrefill] = React.useState<TicketPrefill | null>(null)
  const [chartMenu, setChartMenu] = React.useState<ChartMenuState | null>(null)
  const [editOrder, setEditOrder] = React.useState<FrontendOpenOrder | null>(null)
  const [trendlineDrawing, setTrendlineDrawing] = React.useState(false)
  // Imperative chart handle so the right-click menu can offer Reset View,
  // matching the bot and backtest charts.
  const chartApiRef = React.useRef<PriceChartHandle | null>(null)
  const registerChartApi = React.useCallback((api: PriceChartHandle | null) => {
    chartApiRef.current = api
  }, [])
  const isPaper = selectedValue?.startsWith(PAPER_WALLET_PREFIX) ?? false
  const paperWalletId = isPaper
    ? (selectedValue?.slice(PAPER_WALLET_PREFIX.length) ?? null)
    : null
  const selectedWallet = !isPaper
    ? (wallets.find((wallet) => wallet.id === selectedValue) ?? null)
    : null
  const accountAddress =
    selectedWallet?.vault_address ?? selectedWallet?.account_address ?? null
  const tradingNetwork = resolveTradingNetwork(network, selectedWallet?.network)

  const account = useAccountSnapshot(
    tradingNetwork,
    isPaper ? null : accountAddress
  )
  const marketRows = useMarketRows(tradingNetwork)
  const mids = useAllMids(tradingNetwork)

  const { data: paperAccount, refresh: refreshPaper } =
    useIntervalLoader<PaperAccountResponse | null>(
      React.useCallback(
        () =>
          paperWalletId ? loadPaperAccount(paperWalletId) : Promise.resolve(null),
        [paperWalletId]
      ),
      null,
      4_000
    )
  React.useEffect(() => {
    if (paperWalletId) void refreshPaper()
  }, [paperWalletId, refreshPaper])

  const marketRow = marketRows.find((row) => row.coin === market) ?? null
  const markPx = Number(mids[market] ?? marketRow?.markPx ?? 0)
  const positionMarkets = React.useMemo(
    () =>
      new Set(
        isPaper
          ? (paperAccount?.positions ?? [])
              .filter((position) => Number(position.szi) !== 0)
              .map((position) => position.coin)
          : (account?.clearinghouseState?.assetPositions ?? [])
              .filter(({ position }) => Number(position.szi) !== 0)
              .map(({ position }) => position.coin)
      ),
    [isPaper, paperAccount?.positions, account?.clearinghouseState?.assetPositions]
  )
  const openOrderMarkets = React.useMemo(
    () =>
      new Set(
        (isPaper ? paperAccount?.openOrders : account?.openOrders)?.map(
          (order) => order.coin
        ) ?? []
      ),
    [isPaper, paperAccount?.openOrders, account?.openOrders]
  )

  const summary: AccountSummary | null = isPaper
    ? paperAccount
      ? {
          equity: paperAccount.equity,
          unrealized: paperAccount.unrealized,
          marginUsed: paperAccount.positions.reduce(
            (sum, position) =>
              sum + Math.abs(Number(position.szi)) * Number(position.mark_px),
            0
          ),
          withdrawable: paperAccount.wallet.cash,
        }
      : null
    : account
      ? {
          equity: Number(account.equity),
          unrealized: (account.clearinghouseState?.assetPositions ?? []).reduce(
            (sum, { position }) => sum + Number(position.unrealizedPnl ?? 0),
            0
          ),
          marginUsed: Number(
            account.clearinghouseState?.marginSummary?.totalMarginUsed ?? 0
          ),
          withdrawable: Number(account.withdrawable),
        }
      : null

  const equity = summary?.equity ?? 0
  const paperPosition = paperAccount?.positions.find(
    (position) => position.coin === market
  )
  const sandboxPosition = account?.clearinghouseState?.assetPositions?.find(
    ({ position }) => position.coin === market
  )?.position
  const positionSzi = isPaper
    ? Number(paperPosition?.szi ?? 0)
    : Number(sandboxPosition?.szi ?? 0)

  const priceLines = React.useMemo<ChartPriceLine[]>(() => {
    const lines: ChartPriceLine[] = []
    if (isPaper) {
      if (paperPosition && Number(paperPosition.szi) !== 0) {
        lines.push({
          id: "entry",
          price: Number(paperPosition.entry_px),
          color: "#3b82f6",
          title: "Entry",
          lineStyle: "solid",
        })
      }
      for (const order of paperAccount?.openOrders ?? []) {
        if (order.coin !== market || !order.px) continue
        lines.push({
          id: `paper-order-${order.id}`,
          price: Number(order.px),
          color: order.side === "buy" ? "#089981" : "#f23645",
          title: `${order.side === "buy" ? "Buy" : "Sell"} ${order.sz}`,
          draggable: order.status === "resting",
        })
      }
      return lines
    }

    if (sandboxPosition && Number(sandboxPosition.szi) !== 0) {
      if (sandboxPosition.entryPx) {
        lines.push({
          id: "entry",
          price: Number(sandboxPosition.entryPx),
          color: "#3b82f6",
          title: "Entry",
          lineStyle: "solid",
        })
      }
      if (sandboxPosition.liquidationPx) {
        lines.push({
          id: "liq",
          price: Number(sandboxPosition.liquidationPx),
          color: "#f23645",
          title: "Liq",
        })
      }
    }
    for (const order of account?.openOrders ?? []) {
      if (order.coin !== market) continue
      const description = describeOpenOrder(order)
      lines.push({
        id: `order-${order.oid}`,
        price: Number(description.price),
        color: order.side === "B" ? "#089981" : "#f23645",
        title: `${description.label} ${order.sz}`,
        draggable: true,
      })
    }
    return lines
  }, [isPaper, paperPosition, paperAccount?.openOrders, sandboxPosition, account?.openOrders, market])

  const notify = React.useCallback(
    (text: string, tone: "ok" | "error") => {
      if (tone === "ok") toast.success(text)
      else toast.error(text)
      if (paperWalletId) {
        setTimeout(() => void refreshPaper(), 800)
      }
    },
    [paperWalletId, refreshPaper]
  )
  const handleTrendlinePersistenceError = React.useCallback(
    (action: "load" | "save") =>
      notify(
        `${action === "load" ? "Loading" : "Saving"} chart trendlines failed.`,
        "error"
      ),
    [notify]
  )

  function roundForMarket(price: number): string {
    try {
      return formatPrice(price, marketRow?.szDecimals ?? 4, "perp")
    } catch {
      return price.toPrecision(5)
    }
  }

  function handleChartContextMenu(price: number, x: number, y: number) {
    setChartMenu({ price, px: roundForMarket(price), x, y })
  }

  function handleLineDragEnd(id: string, price: number) {
    const px = roundForMarket(price)

    if (id.startsWith("paper-order-")) {
      if (!paperWalletId) return
      const orderId = id.slice("paper-order-".length)
      void movePaperOrder(paperWalletId, orderId, px)
        .then(() => notify(`Paper order moved to ${px}.`, "ok"))
        .catch((error: unknown) => notify(getPaperErrorMessage(error), "error"))
      return
    }

    if (id.startsWith("order-")) {
      if (!selectedWallet?.is_active) return
      const oid = Number(id.slice("order-".length))
      void modifyOrder({
        walletId: selectedWallet.id,
        market,
        oid,
        px,
      })
        .then((result) => notify(`Order #${oid} moved to ${result.px}.`, "ok"))
        .catch((error: unknown) => notify(getOrderErrorMessage(error), "error"))
    }
  }

  function handleLineClick(id: string) {
    if (!id.startsWith("order-")) return
    const oid = Number(id.slice("order-".length))
    setEditOrder(account?.openOrders.find((order) => order.oid === oid) ?? null)
  }

  const options: WalletOption[] = [
    ...paperWallets.map((wallet) => ({
      value: `${PAPER_WALLET_PREFIX}${wallet.id}`,
      label: wallet.label,
      kind: "paper" as const,
    })),
    ...wallets
      .filter((wallet) => wallet.status === "active")
      .map((wallet) => ({
        value: wallet.id,
        label: wallet.label,
        kind: wallet.network === "mainnet" ? ("mainnet" as const) : ("sandbox" as const),
      })),
  ]

  const outerLayout = usePersistedLayout("trading-layout-vertical")
  const innerLayout = usePersistedLayout("trading-layout-horizontal")
  const rightLayout = usePersistedLayout("trading-layout-right")
  // DB-backed indicator settings: local state flips instantly for the chart;
  // saves are fire-and-forget so they never add latency to a toggle.
  const [indicators, setIndicators] = React.useState(initialIndicators)
  const [prevIndicators, setPrevIndicators] = React.useState(initialIndicators)
  if (prevIndicators !== initialIndicators) {
    // Loader re-ran (e.g. navigated back from the Indicators dashboard):
    // adopt the fresh settings during render.
    setPrevIndicators(initialIndicators)
    setIndicators(initialIndicators)
  }
  const updateIndicator = (id: string, patch: Partial<IndicatorConfig>) => {
    const next = indicators.map((ind) =>
      ind.id === id ? { ...ind, ...patch } : ind
    )
    setIndicators(next)
    const row = next.find((ind) => ind.id === id)
    if (row) {
      void saveIndicator(row).catch(() =>
        notify("Saving indicator settings failed.", "error")
      )
    }
  }
  // The trade chart only works with the pinned set; the full list is managed
  // on the Indicators dashboard.
  const pinnedIndicators = React.useMemo(
    () => indicators.filter((ind) => ind.pinned),
    [indicators]
  )
  const [panels, setPanels] = usePersistedPanels()

  const ticketDisabledReason = isPaper
    ? null
    : !selectedWallet
      ? "Select or create a wallet to trade"
      : !selectedWallet.is_active
        ? "Wallet is disabled"
        : null

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/60">
      <AccountStrip
        options={options}
        selectedValue={selectedValue}
        onWalletChange={onWalletChange}
        left={<MarketInfoBar marketRow={marketRow} price={markPx} />}
        actions={<PanelSettings panels={panels} onChange={setPanels} />}
      />

      <div className="min-h-0 flex-1 p-2 md:p-3">
        <ResizablePanelGroup
          orientation="vertical"
          defaultLayout={outerLayout.defaultLayout}
          onLayoutChanged={outerLayout.onLayoutChanged}
        >
          <ResizablePanel id="main" defaultSize="72%" minSize="30%">
            <ResizablePanelGroup
              orientation="horizontal"
              defaultLayout={innerLayout.defaultLayout}
              onLayoutChanged={innerLayout.onLayoutChanged}
            >
              <ResizablePanel id="watchlist" defaultSize="16%" minSize="10%">
                <WorkspacePanel>
                  <MarketWatchlist
                    network={tradingNetwork}
                    selected={market}
                    positionMarkets={positionMarkets}
                    openOrderMarkets={openOrderMarkets}
                    onSelect={onMarketChange}
                  />
                </WorkspacePanel>
              </ResizablePanel>
              <ResizableHandle gap />
              <ResizablePanel id="chart" defaultSize="48%" minSize="25%">
                <WorkspacePanel className="flex flex-col">
                  <ChartToolbar
                    intervals={CANDLE_INTERVALS}
                    interval={interval}
                    onIntervalChange={setInterval}
                    leading={
                      <span className="text-sm font-semibold">{market}</span>
                    }
                    afterIntervals={
                      <IndicatorsMenu
                        indicators={pinnedIndicators}
                        onUpdate={updateIndicator}
                      />
                    }
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={trendlineDrawing ? "secondary" : "ghost"}
                          size="icon-sm"
                          className="text-muted-foreground aria-pressed:text-foreground"
                          aria-label="Trendline"
                          aria-pressed={trendlineDrawing}
                          onClick={() => setTrendlineDrawing((active) => !active)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <line
                              x1="5"
                              y1="18"
                              x2="19"
                              y2="6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                            />
                            <circle cx="5" cy="18" r="1.75" fill="currentColor" />
                            <circle cx="19" cy="6" r="1.75" fill="currentColor" />
                          </svg>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Trendline</TooltipContent>
                    </Tooltip>
                  </ChartToolbar>
                  <div className="min-h-0 flex-1">
                    <PriceChart
                      network={tradingNetwork}
                      coin={market}
                      interval={interval}
                      priceLines={priceLines}
                      indicators={pinnedIndicators}
                      onLineDragEnd={handleLineDragEnd}
                      onLineClick={handleLineClick}
                      onChartContextMenu={handleChartContextMenu}
                      registerApi={registerChartApi}
                      trendlineDrawing={trendlineDrawing}
                      onTrendlineDrawingChange={setTrendlineDrawing}
                      onTrendlinePersistenceError={handleTrendlinePersistenceError}
                    />
                  </div>
                </WorkspacePanel>
              </ResizablePanel>
              {panels.orderBook || panels.marketDepth ? (
                <>
                  <ResizableHandle gap />
                  <ResizablePanel
                    id="book-tape"
                    defaultSize="16%"
                    minSize="12%"
                  >
                    <ResizablePanelGroup
                      orientation="vertical"
                      defaultLayout={rightLayout.defaultLayout}
                      onLayoutChanged={rightLayout.onLayoutChanged}
                    >
                      {panels.orderBook ? (
                        <ResizablePanel
                          id="book"
                          defaultSize="60%"
                          minSize="20%"
                        >
                          <WorkspacePanel>
                            <OrderBook
                              network={tradingNetwork}
                              coin={market}
                              onPriceClick={(px) => setPrefill({ px })}
                            />
                          </WorkspacePanel>
                        </ResizablePanel>
                      ) : null}
                      {panels.orderBook && panels.marketDepth ? (
                        <ResizableHandle gap />
                      ) : null}
                      {panels.marketDepth ? (
                        <ResizablePanel
                          id="tape"
                          defaultSize="40%"
                          minSize="15%"
                        >
                          <WorkspacePanel>
                            <TradesTape network={tradingNetwork} coin={market} />
                          </WorkspacePanel>
                        </ResizablePanel>
                      ) : null}
                    </ResizablePanelGroup>
                  </ResizablePanel>
                </>
              ) : null}
              <ResizableHandle gap />
              <ResizablePanel id="ticket" defaultSize="20%" minSize="14%">
                <WorkspacePanel className="flex flex-col">
                  <ScrollArea className="min-h-0 flex-1">
                    <OrderTicket
                      walletId={
                        selectedWallet?.is_active
                          ? (selectedWallet?.id ?? null)
                          : null
                      }
                      paperWalletId={paperWalletId}
                      market={market}
                      marketRow={marketRow}
                      markPx={markPx}
                      equity={equity}
                      positionSzi={positionSzi}
                      prefill={prefill}
                      disabledReason={ticketDisabledReason}
                      confirmationEnabled={orderConfirmation}
                      onNotify={notify}
                    />
                  </ScrollArea>
                  <AccountSummaryPanel
                    summary={summary}
                    isPaper={isPaper}
                    workerOnline={workerOnline}
                  />
                </WorkspacePanel>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle gap />
          <ResizablePanel id="bottom" defaultSize="28%" minSize="10%">
            <WorkspacePanel>
              {isPaper ? (
                <PaperBottomTabs account={paperAccount} onNotify={notify} />
              ) : (
                <SandboxBottomTabs
                  network={tradingNetwork}
                  account={account}
                  walletId={
                    selectedWallet?.is_active
                      ? (selectedWallet?.id ?? null)
                      : null
                  }
                  accountAddress={accountAddress}
                  mids={mids}
                  onNotify={notify}
                  editOrder={editOrder}
                  onEditOrderHandled={() => setEditOrder(null)}
                />
              )}
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <ChartOrderMenu
        menu={chartMenu}
        market={market}
        oneClickActions={
          <OneClickMenuActions
            walletId={
              selectedWallet?.is_active ? (selectedWallet?.id ?? null) : null
            }
            isPaper={isPaper}
            market={market}
            marketRow={marketRow}
            markPx={markPx}
            equity={equity}
            disabledReason={ticketDisabledReason}
            confirmationEnabled={orderConfirmation}
            limitPx={chartMenu?.px}
            onNotify={notify}
            onLimitPrefill={(side, px) => {
              setPrefill({ px, side })
              setChartMenu(null)
              toast.success(
                `Ticket prefilled: ${side} limit @ ${px}. Set a size and confirm.`
              )
            }}
            onComplete={() => setChartMenu(null)}
          />
        }
        onResetView={() => chartApiRef.current?.resetView()}
        onClose={() => setChartMenu(null)}
      />

    </div>
  )
}

function PaperBottomTabs({
  account,
  onNotify,
}: {
  account: PaperAccountResponse | null
  onNotify: (message: string, tone: "ok" | "error") => void
}) {
  const positionCount = account?.positions.length ?? 0
  const orderCount = account?.openOrders.length ?? 0

  return (
    <Tabs defaultValue="positions" className="flex h-full min-h-0 flex-col gap-0">
      <TabsList variant="line" className={BOTTOM_TABS_LIST}>
        <TabsTrigger value="positions" className={BOTTOM_TAB_TRIGGER}>
          Positions{positionCount ? ` (${positionCount})` : ""}
        </TabsTrigger>
        <TabsTrigger value="orders" className={BOTTOM_TAB_TRIGGER}>
          Open Orders{orderCount ? ` (${orderCount})` : ""}
        </TabsTrigger>
        <TabsTrigger value="fills" className={BOTTOM_TAB_TRIGGER}>
          Fills
        </TabsTrigger>
      </TabsList>
      <TabsContent value="positions" className="min-h-0 flex-1">
        <PaperPositionsTable account={account} onDone={onNotify} />
      </TabsContent>
      <TabsContent value="orders" className="min-h-0 flex-1">
        <PaperOpenOrdersTable account={account} onDone={onNotify} />
      </TabsContent>
      <TabsContent value="fills" className="min-h-0 flex-1">
        <PaperFillsTable account={account} />
      </TabsContent>
    </Tabs>
  )
}

function SandboxBottomTabs({
  network,
  account,
  walletId,
  accountAddress,
  mids,
  onNotify,
  editOrder,
  onEditOrderHandled,
}: {
  network: TradingNetwork
  account: ReturnType<typeof useAccountSnapshot>
  walletId: string | null
  accountAddress: string | null
  mids: Record<string, string>
  onNotify: (message: string, tone: "ok" | "error") => void
  editOrder: FrontendOpenOrder | null
  onEditOrderHandled: () => void
}) {
  const positionCount = (
    account?.clearinghouseState?.assetPositions ?? []
  ).filter(({ position }) => Number(position.szi) !== 0).length
  const orderCount = account?.openOrders?.length ?? 0
  const activeOrderCount =
    account?.openOrders?.filter((order) => !order.isTrigger).length ?? 0
  const [activeTab, setActiveTab] = React.useState("positions")
  const [confirmCancelAll, setConfirmCancelAll] = React.useState(false)
  const [cancellingAll, setCancellingAll] = React.useState(false)

  async function cancelAllOrders() {
    if (!walletId) return
    const orders = account?.openOrders ?? []
    setCancellingAll(true)
    const results = await Promise.allSettled(
      orders.map((order) =>
        cancelOrder({ walletId, market: order.coin, oid: order.oid })
      )
    )
    const cancelled = results.filter(
      (result) => result.status === "fulfilled"
    ).length
    onNotify(
      cancelled === orders.length
        ? `Cancelled all ${cancelled} orders.`
        : `Cancelled ${cancelled} of ${orders.length} orders.`,
      cancelled === orders.length ? "ok" : "error"
    )
    setCancellingAll(false)
    setConfirmCancelAll(false)
  }

  return (
    <Tabs
      value={editOrder ? "orders" : activeTab}
      onValueChange={setActiveTab}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="flex items-center border-b">
        <TabsList
          variant="line"
          className={cn(BOTTOM_TABS_LIST, "w-auto flex-1 border-b-0")}
        >
          <TabsTrigger value="positions" className={BOTTOM_TAB_TRIGGER}>
            Positions{positionCount ? ` (${positionCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="orders" className={BOTTOM_TAB_TRIGGER}>
            Open Orders{orderCount ? ` (${orderCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="fills" className={BOTTOM_TAB_TRIGGER}>
            Fills
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-3 pr-3 text-xs text-muted-foreground">
          <span>
            Active orders: {" "}
            <strong className="text-foreground">{activeOrderCount}</strong>
          </span>
          <span>
            Open orders: {" "}
            <strong className="text-foreground">{orderCount}</strong>
          </span>
          <Button
            type="button"
            variant="destructive"
            size="xs"
            disabled={!walletId || orderCount === 0}
            onClick={() => setConfirmCancelAll(true)}
          >
            Cancel all orders
          </Button>
        </div>
      </div>
      <TabsContent value="positions" className="min-h-0 flex-1">
        <PositionsTable
          account={account}
          walletId={walletId}
          mids={mids}
          onDone={onNotify}
        />
      </TabsContent>
      <TabsContent value="orders" className="min-h-0 flex-1">
        <OpenOrdersTable
          account={account}
          walletId={walletId}
          onDone={onNotify}
          requestedEditOrder={editOrder}
          onEditOrderHandled={onEditOrderHandled}
        />
      </TabsContent>
      <TabsContent value="fills" className="min-h-0 flex-1">
        <FillsTable network={network} address={accountAddress} />
      </TabsContent>

      <Dialog open={confirmCancelAll} onOpenChange={setConfirmCancelAll}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Cancel all open orders?</DialogTitle>
            <DialogDescription>
              This cancels all {orderCount} orders, including stop-loss and
              take-profit orders.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={cancellingAll}
              onClick={() => setConfirmCancelAll(false)}
            >
              Keep orders
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancellingAll}
              onClick={() => void cancelAllOrders()}
            >
              {cancellingAll ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Cancel all orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}

type PanelVisibility = {
  orderBook: boolean
  marketDepth: boolean
}

const PANELS_STORAGE_KEY = "trading-visible-panels"
const DEFAULT_PANELS: PanelVisibility = {
  orderBook: true,
  marketDepth: true,
}

const PANEL_OPTIONS: { key: keyof PanelVisibility; label: string }[] = [
  { key: "orderBook", label: "Order Book" },
  { key: "marketDepth", label: "Market Depth" },
]

/** Cog dropdown to show/hide dashboard panels. */
function PanelSettings({
  panels,
  onChange,
}: {
  panels: PanelVisibility
  onChange: (next: PanelVisibility) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label="Panel settings"
        >
          <SettingsIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[11px]">Panels</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PANEL_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.key}
            checked={panels[option.key]}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange({ ...panels, [option.key]: checked })
            }
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Panel visibility, persisted to localStorage (unknown keys fall to default). */
function usePersistedPanels() {
  return usePersistedState<PanelVisibility>(
    PANELS_STORAGE_KEY,
    DEFAULT_PANELS,
    (raw) => ({ ...DEFAULT_PANELS, ...(JSON.parse(raw) as Partial<PanelVisibility>) })
  )
}

/** Selected-market summary shown on the left of the account bar. */
function MarketInfoBar({
  marketRow,
  price,
}: {
  marketRow: MarketRow | null
  price: number
}) {
  if (!marketRow) {
    return <span className="text-sm font-semibold text-muted-foreground">—</span>
  }
  const prev = Number(marketRow.prevDayPx)
  const change = prev > 0 ? ((price - prev) / prev) * 100 : 0
  const funding = Number(marketRow.funding) * 100
  const openInterestUsd = Number(marketRow.openInterest) * price
  const tone = change >= 0 ? "text-emerald-600" : "text-red-500"

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-bold">{marketRow.coin}-PERP</span>
        <span className="text-[10px] text-muted-foreground">
          {marketRow.maxLeverage}x
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("font-mono text-lg font-semibold tabular-nums", tone)}>
          {price > 0 ? formatPriceDisplay(String(price)) : "—"}
        </span>
        <span className={cn("font-mono text-[11px] tabular-nums", tone)}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <MarketStat label="Mark" value={formatPriceDisplay(marketRow.markPx)} />
        <MarketStat label="Index" value={formatPriceDisplay(marketRow.oraclePx)} />
        <MarketStat label="Funding" value={`${funding.toFixed(4)}%`} />
        <MarketStat label="24h Vol" value={formatCompactUsd(Number(marketRow.dayNtlVlm))} />
        <MarketStat label="OI" value={formatCompactUsd(openInterestUsd)} />
      </div>
    </div>
  )
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      {label}{" "}
      <span className="font-mono text-foreground tabular-nums">{value}</span>
    </span>
  )
}

/**
 * TradingView-style overlay list over the PINNED indicators only (the full
 * set is managed on the Indicators dashboard): show/hide checkboxes for the
 * painted chart lines; clicking a name opens the shared settings modal. Lives
 * next to the timeframe buttons; strategy signals are picked separately.
 */
function IndicatorsMenu({
  indicators,
  onUpdate,
}: {
  indicators: IndicatorConfig[]
  onUpdate: (id: string, patch: Partial<IndicatorConfig>) => void
}) {
  const activeCount = indicators.filter((ind) => ind.enabled).length
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const editing = indicators.find((ind) => ind.id === editingId) ?? null

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
          >
            Indicators{activeCount ? ` (${activeCount})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 gap-1 p-2">
          {indicators.length === 0 ? (
            <div className="px-1 py-1 text-xs text-muted-foreground">
              No pinned indicators — pin them on the{" "}
              <a href="/indicators" className="underline underline-offset-2">
                Indicators
              </a>{" "}
              page.
            </div>
          ) : null}
          {indicators.map((ind) => (
            <div
              key={ind.id}
              className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
            >
              <Checkbox
                id={`ind-${ind.id}`}
                checked={ind.enabled}
                onCheckedChange={(checked) =>
                  onUpdate(ind.id, { enabled: checked === true })
                }
              />
              <button
                type="button"
                className="flex-1 cursor-pointer text-left text-xs font-medium"
                title="Indicator settings"
                onClick={() => setEditingId(ind.id)}
              >
                {indicatorDisplayName(ind)}
              </button>
            </div>
          ))}
        </PopoverContent>
      </Popover>
      {editing ? (
        <OverlaySettingsDialog
          indicator={editing}
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null)
          }}
          onSave={(next) => {
            // Local flip is instant; persistence is the same fire-and-forget
            // path the checkboxes use (failures surface via the notify strip).
            onUpdate(next.id, next)
            return Promise.resolve()
          }}
        />
      ) : null}
    </>
  )
}
