import * as React from "react"
import { ChevronDownIcon, SettingsIcon } from "lucide-react"
import type { Layout } from "react-resizable-panels"

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
import {
  DEFAULT_CHART_STRATEGY,
  type ChartStrategyState,
} from "@/components/chart/chart-strategy"
import { IndicatorSettingsDialog } from "@/components/chart/chart-strategy-settings"
import { buildRunMarkers } from "@/components/backtest/backtest-overlays"
import { outputToOverlays } from "@/components/chart/indicator-overlays"
import type { QuickTestResponse } from "@/lib/api/quick-test"
import type { FixedStrategyItem } from "@/lib/api/strategies"
import type { SignalStrategyConfig } from "@/lib/strategies/strategy-config"
import { INDICATORS } from "@/lib/indicators/registry"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { getOrderErrorMessage, modifyOrder } from "@/lib/api/orders"
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
import type { TradingNetwork } from "@/lib/hl/network"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import {
  indicatorDisplayName,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"
import { saveIndicator } from "@/lib/api/indicators"
import { OverlaySettingsDialog } from "@/components/indicators/indicator-settings-dialog"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { usePersistedState } from "@/lib/use-persisted-state"
import { cn } from "@/lib/utils"

export const PAPER_WALLET_PREFIX = "paper:"

// Bottom-panel tabs share the backtest workspace's underline styling: active
// tabs are marked by an underline instead of a filled box.
const BOTTOM_TABS_LIST =
  "h-auto w-full justify-start gap-4 rounded-none border-b bg-transparent px-4 py-0"
const BOTTOM_TAB_TRIGGER =
  "flex-none rounded-none border-none px-0 py-2.5 text-xs font-semibold group-data-horizontal/tabs:after:bottom-0"

// Floating-panel look: every terminal region is a white rounded card on the
// muted page canvas, separated by invisible resize handles. Per Tyler's call,
// the terminal uses HALF the site gap (8px / 12px) so the dense layout keeps
// its screen space — documented as an exception in workspace/docs/ui-ux.md.
const PANEL_CARD = "h-full min-h-0 overflow-hidden rounded-xl border bg-card"
const GAP_HANDLE =
  "w-2 bg-transparent after:hidden sm:w-3 aria-[orientation=horizontal]:h-2 sm:aria-[orientation=horizontal]:h-3"

export function TradingWorkspace({
  network,
  wallets,
  paperWallets,
  market,
  selectedValue,
  workerOnline,
  initialIndicators,
  initialStrategies,
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
  /** The seven fixed strategies, including the user's saved pin choices. */
  initialStrategies: FixedStrategyItem[]
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
  // Imperative chart handle so the right-click menu can offer Reset View,
  // matching the bot and backtest charts.
  const chartApiRef = React.useRef<PriceChartHandle | null>(null)
  const registerChartApi = React.useCallback((api: PriceChartHandle | null) => {
    chartApiRef.current = api
  }, [])
  const [notice, setNotice] = React.useState<{
    tone: "ok" | "error"
    text: string
  } | null>(null)

  const isPaper = selectedValue?.startsWith(PAPER_WALLET_PREFIX) ?? false
  const paperWalletId = isPaper
    ? (selectedValue?.slice(PAPER_WALLET_PREFIX.length) ?? null)
    : null
  const selectedWallet = !isPaper
    ? (wallets.find((wallet) => wallet.id === selectedValue) ?? null)
    : null
  const accountAddress =
    selectedWallet?.vault_address ?? selectedWallet?.account_address ?? null

  const account = useAccountSnapshot(network, isPaper ? null : accountAddress)
  const marketRows = useMarketRows(network)
  const mids = useAllMids(network)

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
          equity: Number(
            account.clearinghouseState?.marginSummary?.accountValue ?? 0
          ),
          unrealized: (account.clearinghouseState?.assetPositions ?? []).reduce(
            (sum, { position }) => sum + Number(position.unrealizedPnl ?? 0),
            0
          ),
          marginUsed: Number(
            account.clearinghouseState?.marginSummary?.totalMarginUsed ?? 0
          ),
          withdrawable: Number(account.clearinghouseState?.withdrawable ?? 0),
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
      lines.push({
        id: `order-${order.oid}`,
        price: Number(order.limitPx),
        color: order.side === "B" ? "#089981" : "#f23645",
        title: `${order.side === "B" ? "Buy" : "Sell"} ${order.sz}`,
        draggable: true,
      })
    }
    return lines
  }, [isPaper, paperPosition, paperAccount?.openOrders, sandboxPosition, account?.openOrders, market])

  const notify = React.useCallback(
    (text: string, tone: "ok" | "error") => {
      setNotice({ text, tone })
      if (paperWalletId) {
        setTimeout(() => void refreshPaper(), 800)
      }
    },
    [paperWalletId, refreshPaper]
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
      const order = account?.openOrders?.find((entry) => entry.oid === oid)
      if (!order) return
      void modifyOrder({
        walletId: selectedWallet.id,
        market,
        oid,
        side: order.side === "B" ? "buy" : "sell",
        px,
        sz: order.sz,
        reduceOnly: order.reduceOnly ?? false,
      })
        .then((result) => notify(`Order #${oid} moved to ${result.px}.`, "ok"))
        .catch((error: unknown) => notify(getOrderErrorMessage(error), "error"))
    }
  }

  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

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
  const [chartStrategy, setChartStrategy] = usePersistedState<ChartStrategyState>(
    "trading-chart-strategy",
    DEFAULT_CHART_STRATEGY,
    (raw) => ({
      ...DEFAULT_CHART_STRATEGY,
      ...(JSON.parse(raw) as Partial<ChartStrategyState>),
    })
  )
  // Live copy of each strategy's saved config — the chart dialog edits this
  // and writes it back to the SAME strategy_settings save the Strategies page
  // uses, so the chart and the Strategies page can never show different
  // values. Bots and backtests still snapshot at creation.
  const [strategyConfigs, setStrategyConfigs] = React.useState(
    () =>
      new Map(
        initialStrategies.map((strategy) => [strategy.type, strategy.config])
      )
  )
  const pinnedStrategies = React.useMemo(
    () =>
      initialStrategies
        .filter((strategy) => strategy.pinned)
        .map((strategy) => ({
          ...strategy,
          config: strategyConfigs.get(strategy.type) ?? strategy.config,
        })),
    [initialStrategies, strategyConfigs]
  )
  const selectedStrategyType = chartStrategy.indicator?.type
  if (
    selectedStrategyType &&
    !pinnedStrategies.some((strategy) => strategy.type === selectedStrategyType)
  ) {
    setChartStrategy({ ...chartStrategy, indicator: null })
  }
  const selectedStrategyConfig = selectedStrategyType
    ? strategyConfigs.get(selectedStrategyType)
    : undefined
  const [strategySettingsOpen, setStrategySettingsOpen] = React.useState(false)
  const [quickTest, setQuickTest] = React.useState<QuickTestResponse | null>(
    null
  )

  const updateSelectedStrategyConfig = React.useCallback(
    (next: SignalStrategyConfig) => {
      if (!selectedStrategyType) return
      setStrategyConfigs((current) =>
        new Map(current).set(selectedStrategyType, next)
      )
    },
    [selectedStrategyType]
  )

  // The last quick test's chips AND paint; stale the moment the context
  // changes. While active, the chart shows the test's own computation —
  // zones, arrows, and trade chips from one run, so they always correspond.
  React.useEffect(() => {
    setQuickTest(null)
  }, [market, interval, chartStrategy.indicator])
  const quickMarkers = React.useMemo(
    () => (quickTest ? buildRunMarkers(quickTest.result) : []),
    [quickTest]
  )
  const quickOverlays = React.useMemo(
    () => (quickTest ? outputToOverlays(quickTest.output) : null),
    [quickTest]
  )

  const ticketDisabledReason = isPaper
    ? null
    : !selectedWallet
      ? "Select or create a wallet to trade"
      : !selectedWallet.is_active
        ? "Wallet is disabled"
        : null

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/40">
      <AccountStrip
        options={options}
        selectedValue={selectedValue}
        onWalletChange={onWalletChange}
        left={<MarketInfoBar marketRow={marketRow} price={markPx} />}
        actions={<PanelSettings panels={panels} onChange={setPanels} />}
      />

      {notice ? (
        <div
          className={cn(
            "border-b px-3 py-1.5 text-xs",
            notice.tone === "ok"
              ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 p-1.5 sm:p-2 md:p-3">
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
                <div className={PANEL_CARD}>
                  <MarketWatchlist
                    network={network}
                    selected={market}
                    onSelect={onMarketChange}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle className={GAP_HANDLE} />
              <ResizablePanel id="chart" defaultSize="48%" minSize="25%">
                <div className={cn(PANEL_CARD, "flex flex-col")}>
                  <ChartToolbar
                    intervals={CANDLE_INTERVALS}
                    interval={interval}
                    onIntervalChange={setInterval}
                    legend={{
                      signals: Boolean(
                        panels.signalLegend &&
                          chartStrategy.indicator &&
                          chartStrategy.showSignals
                      ),
                    }}
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
                    <StrategyToolbar
                      state={chartStrategy}
                      strategies={pinnedStrategies}
                      onChange={setChartStrategy}
                      onOpenSettings={() => setStrategySettingsOpen(true)}
                    />
                  </ChartToolbar>
                  <div className="min-h-0 flex-1">
                    <PriceChart
                      network={network}
                      coin={market}
                      interval={interval}
                      priceLines={priceLines}
                      markers={quickMarkers}
                      indicators={pinnedIndicators}
                      chartStrategy={
                        chartStrategy.indicator ? chartStrategy : null
                      }
                      overrideOverlays={quickOverlays}
                      onLineDragEnd={handleLineDragEnd}
                      onChartContextMenu={handleChartContextMenu}
                      registerApi={registerChartApi}
                    />
                  </div>
                </div>
              </ResizablePanel>
              {panels.orderBook || panels.marketDepth ? (
                <>
                  <ResizableHandle className={GAP_HANDLE} />
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
                          <div className={PANEL_CARD}>
                            <OrderBook
                              network={network}
                              coin={market}
                              onPriceClick={(px) => setPrefill({ px })}
                            />
                          </div>
                        </ResizablePanel>
                      ) : null}
                      {panels.orderBook && panels.marketDepth ? (
                        <ResizableHandle className={GAP_HANDLE} />
                      ) : null}
                      {panels.marketDepth ? (
                        <ResizablePanel
                          id="tape"
                          defaultSize="40%"
                          minSize="15%"
                        >
                          <div className={PANEL_CARD}>
                            <TradesTape network={network} coin={market} />
                          </div>
                        </ResizablePanel>
                      ) : null}
                    </ResizablePanelGroup>
                  </ResizablePanel>
                </>
              ) : null}
              <ResizableHandle className={GAP_HANDLE} />
              <ResizablePanel id="ticket" defaultSize="20%" minSize="14%">
                <div className={cn(PANEL_CARD, "flex flex-col")}>
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
                    />
                  </ScrollArea>
                  <AccountSummaryPanel
                    summary={summary}
                    isPaper={isPaper}
                    workerOnline={workerOnline}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle className={GAP_HANDLE} />
          <ResizablePanel id="bottom" defaultSize="28%" minSize="10%">
            <div className={PANEL_CARD}>
              {isPaper ? (
                <PaperBottomTabs account={paperAccount} onNotify={notify} />
              ) : (
                <SandboxBottomTabs
                  network={network}
                  account={account}
                  walletId={
                    selectedWallet?.is_active
                      ? (selectedWallet?.id ?? null)
                      : null
                  }
                  accountAddress={accountAddress}
                  mids={mids}
                  onNotify={notify}
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <ChartOrderMenu
        menu={chartMenu}
        market={market}
        onAction={(side, px) => {
          setPrefill({ px, side })
          setChartMenu(null)
          setNotice({
            tone: "ok",
            text: `Ticket prefilled: ${side} limit @ ${px}. Set a size and confirm.`,
          })
        }}
        onResetView={() => chartApiRef.current?.resetView()}
        onClose={() => setChartMenu(null)}
      />

      <IndicatorSettingsDialog
        open={strategySettingsOpen}
        onOpenChange={setStrategySettingsOpen}
        state={chartStrategy}
        onChange={setChartStrategy}
        config={selectedStrategyConfig}
        onConfigChange={(next) => {
          updateSelectedStrategyConfig(next)
          // The chart paints from the same edited params, live.
          setChartStrategy({ ...chartStrategy, indicator: next.indicator })
        }}
        pinned={
          initialStrategies.find(
            (strategy) => strategy.type === selectedStrategyType
          )?.pinned ?? false
        }
        network={network}
        market={market}
        onQuickTestResult={setQuickTest}
      />
    </div>
  )
}

/**
 * Chart-toolbar strategy picker, styled like the Indicators menu: a checkbox
 * list (one strategy at a time — checking one replaces the other) with a cog
 * beside the checked strategy to open its settings dialog. The picked
 * strategy paints signals from the SAME compute the strategy engine trades
 * on. (Strategies are built from indicators, but the show/hide overlay list
 * is the separate "Indicators" menu by the timeframes.)
 */
function StrategyToolbar({
  state,
  strategies,
  onChange,
  onOpenSettings,
}: {
  state: ChartStrategyState
  strategies: FixedStrategyItem[]
  onChange: (next: ChartStrategyState) => void
  onOpenSettings: () => void
}) {
  const label = state.indicator
    ? INDICATORS[state.indicator.type].label
    : "Strategy"
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
          {label}
          <ChevronDownIcon className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-1 p-2">
        <div className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
          <Checkbox
            id="strat-none"
            checked={!state.indicator}
            onCheckedChange={(checked) => {
              if (checked === true) onChange({ ...state, indicator: null })
            }}
          />
          <Label
            htmlFor="strat-none"
            className="flex-1 cursor-pointer text-xs font-medium"
          >
            None
          </Label>
        </div>
        {strategies.length === 0 ? (
          <div className="px-1 py-1 text-xs text-muted-foreground">
            No pinned strategies — pin them on the{" "}
            <a href="/strategies" className="underline underline-offset-2">
              Strategies
            </a>{" "}
            page.
          </div>
        ) : null}
        {strategies.map((strategy) => {
          const selected = state.indicator?.type === strategy.type
          return (
            <div
              key={strategy.type}
              className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
            >
              <Checkbox
                id={`strat-${strategy.type}`}
                checked={selected}
                onCheckedChange={(checked) =>
                  onChange({
                    ...state,
                    indicator:
                      checked === true
                        ? strategy.config.indicator
                        : null,
                  })
                }
              />
              <Label
                htmlFor={`strat-${strategy.type}`}
                className="flex-1 cursor-pointer text-xs font-medium"
              >
                {strategy.label}
              </Label>
              {selected ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 text-muted-foreground"
                  aria-label={`${strategy.label} settings`}
                  title="Strategy settings"
                  onClick={onOpenSettings}
                >
                  <SettingsIcon className="size-3.5" />
                </Button>
              ) : null}
            </div>
          )
        })}
      </PopoverContent>
    </Popover>
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
}: {
  network: TradingNetwork
  account: ReturnType<typeof useAccountSnapshot>
  walletId: string | null
  accountAddress: string | null
  mids: Record<string, string>
  onNotify: (message: string, tone: "ok" | "error") => void
}) {
  const positionCount = (
    account?.clearinghouseState?.assetPositions ?? []
  ).filter(({ position }) => Number(position.szi) !== 0).length
  const orderCount = account?.openOrders?.length ?? 0

  return (
    <Tabs
      defaultValue="positions"
      className="flex h-full min-h-0 flex-col gap-0"
    >
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
        />
      </TabsContent>
      <TabsContent value="fills" className="min-h-0 flex-1">
        <FillsTable network={network} address={accountAddress} />
      </TabsContent>
    </Tabs>
  )
}

type PanelVisibility = {
  orderBook: boolean
  marketDepth: boolean
  /** The "▲▼ signal only — not a trade" legend in the chart toolbar. */
  signalLegend: boolean
}

const PANELS_STORAGE_KEY = "trading-visible-panels"
const DEFAULT_PANELS: PanelVisibility = {
  orderBook: true,
  marketDepth: true,
  signalLegend: true,
}

const PANEL_OPTIONS: { key: keyof PanelVisibility; label: string }[] = [
  { key: "orderBook", label: "Order Book" },
  { key: "marketDepth", label: "Market Depth" },
  { key: "signalLegend", label: "Signal legend" },
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

function usePersistedLayout(key: string) {
  const [defaultLayout] = React.useState<Layout | undefined>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as Layout) : undefined
    } catch {
      return undefined
    }
  })

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // storage full/blocked — layout just won't persist
      }
    },
    [key]
  )

  return { defaultLayout, onLayoutChanged }
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
