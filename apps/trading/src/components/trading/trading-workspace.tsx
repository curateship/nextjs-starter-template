import * as React from "react"
import { SettingsIcon } from "lucide-react"
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
import { PriceChart, type ChartPriceLine } from "@/components/trading/price-chart"
import { TradesTape } from "@/components/trading/trades-tape"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
  useWebData2,
  type MarketRow,
} from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import {
  DEFAULT_INDICATORS,
  INDICATOR_LABELS,
  INDICATOR_PARAM_FIELDS,
  indicatorColor,
  primaryColorSlot,
  type IndicatorConfig,
  type IndicatorType,
} from "@/lib/trading/indicators-config"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { usePersistedState } from "@/lib/use-persisted-state"
import { cn } from "@/lib/utils"

export const PAPER_WALLET_PREFIX = "paper:"

// Bottom-panel tabs share the backtest workspace's underline styling: a light
// gray bar with active tabs marked by an underline instead of a filled box.
const BOTTOM_TABS_LIST =
  "h-auto w-full justify-start gap-4 rounded-none border-none bg-muted/50 px-4 py-0"
const BOTTOM_TAB_TRIGGER =
  "flex-none rounded-none border-none px-0 py-2.5 text-xs font-semibold group-data-horizontal/tabs:after:bottom-0"

export function TradingWorkspace({
  network,
  wallets,
  paperWallets,
  market,
  selectedValue,
  workerOnline,
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
  onMarketChange: (coin: string) => void
  onWalletChange: (value: string) => void
}) {
  const [interval, setInterval] = React.useState<CandleInterval>("15m")
  const [prefill, setPrefill] = React.useState<TicketPrefill | null>(null)
  const [chartMenu, setChartMenu] = React.useState<ChartMenuState | null>(null)
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

  const webData = useWebData2(network, isPaper ? null : accountAddress)
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
    : webData
      ? {
          equity: Number(
            webData.clearinghouseState?.marginSummary?.accountValue ?? 0
          ),
          unrealized: (webData.clearinghouseState?.assetPositions ?? []).reduce(
            (sum, { position }) => sum + Number(position.unrealizedPnl ?? 0),
            0
          ),
          marginUsed: Number(
            webData.clearinghouseState?.marginSummary?.totalMarginUsed ?? 0
          ),
          withdrawable: Number(webData.clearinghouseState?.withdrawable ?? 0),
        }
      : null

  const equity = summary?.equity ?? 0
  const paperPosition = paperAccount?.positions.find(
    (position) => position.coin === market
  )
  const sandboxPosition = webData?.clearinghouseState?.assetPositions?.find(
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
    for (const order of webData?.openOrders ?? []) {
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
  }, [isPaper, paperPosition, paperAccount?.openOrders, sandboxPosition, webData?.openOrders, market])

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
      const order = webData?.openOrders?.find((entry) => entry.oid === oid)
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
    ...wallets.map((wallet) => ({
      value: wallet.id,
      label: wallet.label,
      kind: wallet.network === "mainnet" ? ("mainnet" as const) : ("sandbox" as const),
    })),
  ]

  const outerLayout = usePersistedLayout("trading-layout-vertical")
  const innerLayout = usePersistedLayout("trading-layout-horizontal")
  const rightLayout = usePersistedLayout("trading-layout-right")
  const [indicators, setIndicators] = usePersistedIndicators()
  const [panels, setPanels] = usePersistedPanels()

  const ticketDisabledReason = isPaper
    ? null
    : !selectedWallet
      ? "Select or create a wallet to trade"
      : !selectedWallet.is_active
        ? "Wallet is disabled"
        : null

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col">
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

      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 flex-1"
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
              <MarketWatchlist
                network={network}
                selected={market}
                onSelect={onMarketChange}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="chart" defaultSize="48%" minSize="25%">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center gap-1 border-b bg-muted/50 px-2 py-1">
                  <span className="mr-2 text-sm font-semibold">{market}</span>
                  {CANDLE_INTERVALS.map((candidate) => (
                    <Button
                      key={candidate}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-6 px-2 text-xs",
                        interval === candidate && "bg-muted"
                      )}
                      onClick={() => setInterval(candidate)}
                    >
                      {candidate}
                    </Button>
                  ))}
                  <IndicatorsMenu
                    indicators={indicators}
                    onChange={setIndicators}
                  />
                </div>
                <div className="min-h-0 flex-1">
                  <PriceChart
                    network={network}
                    coin={market}
                    interval={interval}
                    priceLines={priceLines}
                    indicators={indicators}
                    onLineDragEnd={handleLineDragEnd}
                    onChartContextMenu={handleChartContextMenu}
                  />
                </div>
              </div>
            </ResizablePanel>
            {panels.orderBook || panels.marketDepth ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel id="book-tape" defaultSize="18%" minSize="12%">
                  <ResizablePanelGroup
                    orientation="vertical"
                    defaultLayout={rightLayout.defaultLayout}
                    onLayoutChanged={rightLayout.onLayoutChanged}
                  >
                    {panels.orderBook ? (
                      <ResizablePanel id="book" defaultSize="60%" minSize="20%">
                        <OrderBook
                          network={network}
                          coin={market}
                          onPriceClick={(px) => setPrefill({ px })}
                        />
                      </ResizablePanel>
                    ) : null}
                    {panels.orderBook && panels.marketDepth ? (
                      <ResizableHandle withHandle />
                    ) : null}
                    {panels.marketDepth ? (
                      <ResizablePanel id="tape" defaultSize="40%" minSize="15%">
                        <TradesTape network={network} coin={market} />
                      </ResizablePanel>
                    ) : null}
                  </ResizablePanelGroup>
                </ResizablePanel>
              </>
            ) : null}
            <ResizableHandle withHandle />
            <ResizablePanel id="ticket" defaultSize="18%" minSize="14%">
              <ScrollArea className="h-full">
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
                <AccountSummaryPanel
                  summary={summary}
                  isPaper={isPaper}
                  workerOnline={workerOnline}
                />
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="bottom" defaultSize="28%" minSize="10%">
          {isPaper ? (
            <PaperBottomTabs account={paperAccount} onNotify={notify} />
          ) : (
            <SandboxBottomTabs
              network={network}
              webData={webData}
              walletId={
                selectedWallet?.is_active ? (selectedWallet?.id ?? null) : null
              }
              accountAddress={accountAddress}
              mids={mids}
              onNotify={notify}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

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
  webData,
  walletId,
  accountAddress,
  mids,
  onNotify,
}: {
  network: TradingNetwork
  webData: ReturnType<typeof useWebData2>
  walletId: string | null
  accountAddress: string | null
  mids: Record<string, string>
  onNotify: (message: string, tone: "ok" | "error") => void
}) {
  const positionCount = (
    webData?.clearinghouseState?.assetPositions ?? []
  ).filter(({ position }) => Number(position.szi) !== 0).length
  const orderCount = webData?.openOrders?.length ?? 0

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
          webData={webData}
          walletId={walletId}
          mids={mids}
          onDone={onNotify}
        />
      </TabsContent>
      <TabsContent value="orders" className="min-h-0 flex-1">
        <OpenOrdersTable
          webData={webData}
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

type PanelVisibility = { orderBook: boolean; marketDepth: boolean }

const PANELS_STORAGE_KEY = "trading-visible-panels"
const DEFAULT_PANELS: PanelVisibility = { orderBook: true, marketDepth: true }

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
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-bold">{marketRow.coin}</span>
        <span className="text-[10px] text-muted-foreground">
          Perp · {marketRow.maxLeverage}x
        </span>
      </div>
      <div className="flex flex-col leading-tight">
        <span className={cn("font-mono text-sm font-semibold tabular-nums", tone)}>
          {price > 0 ? formatPriceDisplay(String(price)) : "—"}
        </span>
        <span className={cn("font-mono text-[10px] tabular-nums", tone)}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
      <MarketStat label="Mark" value={formatPriceDisplay(marketRow.markPx)} />
      <MarketStat label="Index" value={formatPriceDisplay(marketRow.oraclePx)} />
      <MarketStat label="Funding" value={`${funding.toFixed(4)}%`} />
      <MarketStat label="24h Vol" value={formatCompactUsd(Number(marketRow.dayNtlVlm))} />
      <MarketStat label="Open Interest" value={formatCompactUsd(openInterestUsd)} />
    </div>
  )
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </div>
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

/** Accepts a value only if it matches the current canonical indicator shape. */
function isIndicatorConfig(value: unknown): value is IndicatorConfig {
  if (!value || typeof value !== "object") return false
  const config = value as Record<string, unknown>
  if (typeof config.id !== "string" || typeof config.enabled !== "boolean") {
    return false
  }
  if (config.color !== undefined && typeof config.color !== "string") return false
  if (typeof config.type !== "string" || !(config.type in INDICATOR_PARAM_FIELDS)) {
    return false
  }
  const params = config.params
  if (!params || typeof params !== "object") return false
  return INDICATOR_PARAM_FIELDS[config.type as IndicatorType].every((field) => {
    const value = (params as Record<string, unknown>)[field.key]
    return typeof value === "number" && Number.isFinite(value) && value > 0
  })
}

/**
 * Hard cut: localStorage prefs are non-authoritative. Use them only when the
 * whole blob matches the current canonical shape; otherwise discard and reset
 * to defaults — no field-by-field migration or coercion of stale state.
 */
function parsePersistedIndicators(raw: string): IndicatorConfig[] {
  const parsed: unknown = JSON.parse(raw)
  if (Array.isArray(parsed) && parsed.every(isIndicatorConfig)) {
    return withMissingDefaults(parsed)
  }
  console.warn("Invalid trading-indicators in storage; resetting to defaults.")
  return DEFAULT_INDICATORS
}

/**
 * Appends default indicators the stored list predates (e.g. a "Base" added
 * after the user first saved their prefs) so new indicators always show up,
 * without touching their existing customizations. Additive only — no
 * field-by-field migration of stored entries.
 */
function withMissingDefaults(stored: IndicatorConfig[]): IndicatorConfig[] {
  const ids = new Set(stored.map((config) => config.id))
  const missing = DEFAULT_INDICATORS.filter((config) => !ids.has(config.id))
  return missing.length ? [...stored, ...missing] : stored
}

function usePersistedIndicators() {
  return usePersistedState<IndicatorConfig[]>(
    "trading-indicators",
    DEFAULT_INDICATORS,
    parsePersistedIndicators
  )
}

function IndicatorsMenu({
  indicators,
  onChange,
}: {
  indicators: IndicatorConfig[]
  onChange: React.Dispatch<React.SetStateAction<IndicatorConfig[]>>
}) {
  const activeCount = indicators.filter((ind) => ind.enabled).length
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")

  const update = (id: string, patch: Partial<IndicatorConfig>) =>
    onChange((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, ...patch } : ind))
    )
  const setParam = (ind: IndicatorConfig, key: string, raw: string) => {
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return
    update(ind.id, { params: { ...ind.params, [key]: value } })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-xs"
        >
          Indicators{activeCount ? ` (${activeCount})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-2">
        {indicators.map((ind) => (
          <div key={ind.id} className="rounded px-1 py-1 hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`ind-${ind.id}`}
                checked={ind.enabled}
                onCheckedChange={(checked) =>
                  update(ind.id, { enabled: checked === true })
                }
              />
              <Label
                htmlFor={`ind-${ind.id}`}
                className="flex-1 cursor-pointer text-xs font-medium"
              >
                {INDICATOR_LABELS[ind.type]}
                {ind.type === "ema" ? ` ${ind.params.period}` : ""}
              </Label>
              <input
                type="color"
                aria-label={`${INDICATOR_LABELS[ind.type]} color`}
                className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                value={ind.color ?? indicatorColor(primaryColorSlot(ind), isDark)}
                onChange={(event) =>
                  update(ind.id, { color: event.target.value })
                }
              />
            </div>
            {ind.enabled && INDICATOR_PARAM_FIELDS[ind.type].length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-2 pl-6">
                {INDICATOR_PARAM_FIELDS[ind.type].map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground"
                  >
                    {field.label}
                    <Input
                      type="number"
                      min={field.step ?? 1}
                      step={field.step ?? 1}
                      value={ind.params[field.key] ?? ""}
                      onChange={(event) =>
                        setParam(ind, field.key, event.target.value)
                      }
                      className="h-6 w-14 px-1 text-xs"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
