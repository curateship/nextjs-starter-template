import * as React from "react"
import type { Layout } from "react-resizable-panels"

import { formatPrice } from "@nktkas/hyperliquid/utils"

import {
  AccountStrip,
  type AccountSummary,
  type WalletOption,
} from "@/components/trading/account-strip"
import {
  FillsTable,
  OpenOrdersTable,
  PositionsTable,
} from "@/components/trading/bottom-tables"
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
import { useAllMids, useMarketRows, useWebData2 } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { cn } from "@/lib/utils"

export const PAPER_WALLET_PREFIX = "paper:"

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
        network={network}
        options={options}
        selectedValue={selectedValue}
        onWalletChange={onWalletChange}
        summary={summary}
        isPaper={isPaper}
        workerOnline={workerOnline}
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
                <div className="flex items-center gap-1 border-b px-2 py-1">
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
                </div>
                <div className="min-h-0 flex-1">
                  <PriceChart
                    network={network}
                    coin={market}
                    interval={interval}
                    priceLines={priceLines}
                    onLineDragEnd={handleLineDragEnd}
                    onChartContextMenu={handleChartContextMenu}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="book-tape" defaultSize="18%" minSize="12%">
              <ResizablePanelGroup
                orientation="vertical"
                defaultLayout={rightLayout.defaultLayout}
                onLayoutChanged={rightLayout.onLayoutChanged}
              >
                <ResizablePanel id="book" defaultSize="60%" minSize="20%">
                  <OrderBook
                    network={network}
                    coin={market}
                    onPriceClick={(px) => setPrefill({ px })}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="tape" defaultSize="40%" minSize="15%">
                  <TradesTape network={network} coin={market} />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="ticket" defaultSize="18%" minSize="14%">
              <OrderTicket
                walletId={
                  selectedWallet?.is_active ? (selectedWallet?.id ?? null) : null
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
      <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
        <TabsTrigger
          value="positions"
          className="rounded-none data-[state=active]:bg-muted"
        >
          Positions{positionCount ? ` (${positionCount})` : ""}
        </TabsTrigger>
        <TabsTrigger
          value="orders"
          className="rounded-none data-[state=active]:bg-muted"
        >
          Open Orders{orderCount ? ` (${orderCount})` : ""}
        </TabsTrigger>
        <TabsTrigger
          value="fills"
          className="rounded-none data-[state=active]:bg-muted"
        >
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
      <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
        <TabsTrigger
          value="positions"
          className="rounded-none data-[state=active]:bg-muted"
        >
          Positions{positionCount ? ` (${positionCount})` : ""}
        </TabsTrigger>
        <TabsTrigger
          value="orders"
          className="rounded-none data-[state=active]:bg-muted"
        >
          Open Orders{orderCount ? ` (${orderCount})` : ""}
        </TabsTrigger>
        <TabsTrigger
          value="fills"
          className="rounded-none data-[state=active]:bg-muted"
        >
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
