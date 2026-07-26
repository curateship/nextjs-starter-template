import * as React from "react"
import { ClientOnly, useRouter } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { ArrowLeftIcon } from "lucide-react"

import {
  BacktestMarketsTable,
  sortMarketRows,
  useMarketSort,
} from "@/components/backtest/backtest-markets-table"
import { StrategyTester } from "@/components/backtest/strategy-tester"
import { BotLiveChartPanel } from "@/components/bots/bot-live-chart-panel"
import { buildBotMarketRows } from "@/components/bots/bot-market-rows"
import { buildBotResult } from "@/components/bots/bot-result"
import { buildBotRoundTrips } from "@/components/bots/bot-round-trips"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { IconButton } from "@/components/icon-button"
import { PanelToggle } from "@/components/panel-toggles"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMarketRows } from "@/lib/hl/hooks"
import type { JournalOverviewResponse } from "@/lib/api/journal"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { togglePanel } from "@/lib/panel-collapse"
import { usePanelLayout } from "@/lib/use-panel-layout"

import {
  buildJournalSummary,
  defaultMarket,
  marketsOf,
  marketsWithOpenPosition,
  openPositionState,
  toRoundTripFills,
  walletStartEquity,
} from "./journal-model"
import { JournalSummaryPanel } from "./journal-summary-panel"

const ALL_WALLETS = "all"

/**
 * The trade journal: your own real trades in the same four panels the backtest
 * run workspace uses — summary, chart, markets, trades.
 *
 * The chart is the shared live one (`BotLiveChartPanel` → `PriceChart`), which
 * pans and loads older candles as you scroll back. A trade is only reviewable
 * if you can move around it, so this page must never grow a chart of its own.
 */
export function JournalWorkspace({
  initial,
}: {
  initial: JournalOverviewResponse
}) {
  const router = useRouter()
  const { wallets, fills, syncError } = initial

  const [walletId, setWalletId] = React.useState(ALL_WALLETS)
  const [interval, setInterval] = React.useState<CandleInterval>("15m")

  // Cumulative columns are computed here, after filtering — a total worked out
  // before the wallet filter would quietly blend two wallets' money together.
  const walletFills = React.useMemo(
    () =>
      walletId === ALL_WALLETS
        ? fills
        : fills.filter((fill) => fill.walletId === walletId),
    [fills, walletId]
  )

  const markets = React.useMemo(() => marketsOf(walletFills), [walletFills])

  const accountValue = React.useMemo(() => {
    if (walletId === ALL_WALLETS) {
      return wallets.reduce((sum, wallet) => sum + wallet.accountValue, 0)
    }
    return wallets.find((wallet) => wallet.id === walletId)?.accountValue ?? 0
  }, [wallets, walletId])

  const summary = React.useMemo(
    () => buildJournalSummary(walletFills, markets, accountValue),
    [walletFills, markets, accountValue]
  )

  const rtFills = React.useMemo(
    () => toRoundTripFills(walletFills),
    [walletFills]
  )

  // Memoised: nothing is selected until the user clicks a market, so this is
  // the standing code path and it re-pairs every market. The live price feed
  // re-renders this component on every tick, which would otherwise redo it all.
  const fallbackMarket = React.useMemo(
    () => defaultMarket(markets, rtFills),
    [markets, rtFills]
  )
  const [selectedMarket, setSelectedMarket] = React.useState("")
  const resolvedMarket = markets.includes(selectedMarket)
    ? selectedMarket
    : fallbackMarket

  // A trade number only means something within one market's list, so changing
  // market or wallet clears it. Done in the handlers rather than an effect —
  // the same convention the backtest dashboards use for their table state.
  const [focusedTradeN, setFocusedTradeN] = React.useState<number | null>(null)

  const selectMarket = (market: string) => {
    setSelectedMarket(market)
    setFocusedTradeN(null)
  }

  const selectWallet = (id: string) => {
    setWalletId(id)
    setSelectedMarket("")
    setFocusedTradeN(null)
  }

  const marketSort = useMarketSort("net")

  // Live mark price for the selected market, so a position still open is
  // valued at what it is worth now rather than shown as flat.
  const liveMarkets = useMarketRows("mainnet")
  const markPrice = Number(
    liveMarkets.find((row) => row.coin === resolvedMarket)?.markPx ?? 0
  )

  // Every market's return is measured against the wallet's own starting
  // equity — one real wallet funds them all, so there is no per-market cash.
  const startEquity = walletStartEquity(accountValue, summary.netPnl)
  const openStates = React.useMemo(
    () => marketsWithOpenPosition(markets, rtFills),
    [markets, rtFills]
  )
  const marketRows = React.useMemo(
    () =>
      sortMarketRows(
        buildBotMarketRows(markets, openStates, rtFills, () => startEquity),
        marketSort.sortColumn,
        marketSort.sortDirection
      ),
    [
      markets,
      openStates,
      rtFills,
      startEquity,
      marketSort.sortColumn,
      marketSort.sortDirection,
    ]
  )

  const marketFills = React.useMemo(
    () => rtFills.filter((fill) => fill.market === resolvedMarket),
    [rtFills, resolvedMarket]
  )
  const trips = React.useMemo(
    () => buildBotRoundTrips(marketFills, markPrice),
    [marketFills, markPrice]
  )
  // A position still open becomes the trade list's live row, marked to the
  // current price — otherwise money at risk right now shows up nowhere.
  const openState = React.useMemo(
    () => openPositionState(trips, resolvedMarket),
    [trips, resolvedMarket]
  )
  const result = React.useMemo(
    () => buildBotResult(trips, marketFills, openState, startEquity ?? 0),
    [trips, marketFills, openState, startEquity]
  )

  // Collapsible panels, persisted — the backtest and bot workspaces' pattern.
  const summaryPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const tradesPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const [summaryCollapsed, setSummaryCollapsed] = React.useState(false)
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)
  const [tradesCollapsed, setTradesCollapsed] = React.useState(false)
  const horizontalLayout = usePanelLayout("journal-workspace-horizontal")
  const verticalLayout = usePanelLayout("journal-workspace-vertical")

  // The toggles live in the bottom panel's tab bar — the Trade terminal's
  // placement. That panel collapses to exactly this row, so the buttons that
  // reopen the panels never disappear along with them.
  const panelToggles = (
    <div className="flex shrink-0 items-center gap-1">
      <PanelToggle
        side="left"
        collapsed={summaryCollapsed}
        label={summaryCollapsed ? "Show summary panel" : "Hide summary panel"}
        onClick={() => togglePanel(summaryPanelRef, "21%")}
      />
      <PanelToggle
        side="right"
        collapsed={marketsCollapsed}
        label={marketsCollapsed ? "Show markets panel" : "Hide markets panel"}
        onClick={() => togglePanel(marketsPanelRef, "26%")}
      />
      <PanelToggle
        side="bottom"
        collapsed={tradesCollapsed}
        label={tradesCollapsed ? "Show trades panel" : "Hide trades panel"}
        onClick={() => togglePanel(tradesPanelRef, "32%")}
      />
    </div>
  )

  const walletLabel =
    walletId === ALL_WALLETS
      ? `${wallets.length} ${wallets.length === 1 ? "wallet" : "wallets"}`
      : (wallets.find((wallet) => wallet.id === walletId)?.label ?? "Wallet")

  if (wallets.length === 0) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col items-center justify-center gap-3 bg-muted/60 p-6 text-center dark:bg-background">
        <p className="text-sm font-medium">No real-money wallet yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The journal only records real trades, so it needs a mainnet wallet.
          Testnet and practice money are left out on purpose — mixing fake money
          in makes the totals meaningless.
        </p>
        <IconButton
          label="Go to wallets"
          onClick={() => void router.navigate({ to: "/wallets" })}
        >
          <ArrowLeftIcon className="size-4" />
        </IconButton>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/60 dark:bg-background">
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
        <IconButton
          label="Back to PnL"
          onClick={() => void router.navigate({ to: "/pnl" })}
        >
          <ArrowLeftIcon className="size-4" />
        </IconButton>
        <Breadcrumbs crumbs={[{ label: "PnL", to: "/pnl" }, { label: "Journal" }]} />
        <div className="flex-1" />
        <Select value={walletId} onValueChange={selectWallet}>
          <SelectTrigger className="min-w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL_WALLETS}>All wallets</SelectItem>
            {wallets.map((wallet) => (
              <SelectItem key={wallet.id} value={wallet.id}>
                {wallet.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {syncError ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          Showing saved trades only — checking Hyperliquid for new ones failed:{" "}
          {syncError}
        </div>
      ) : null}

      <ClientOnly fallback={null}>
        <div className="min-h-0 flex-1 p-[var(--shell-gutter,0.75rem)]">
          <ResizablePanelGroup
            key={verticalLayout.layoutKey}
            orientation="vertical"
            defaultLayout={verticalLayout.defaultLayout}
            onLayoutChanged={verticalLayout.onLayoutChanged}
          >
            <ResizablePanel id="main" defaultSize="68%" minSize="35%">
              <ResizablePanelGroup
                key={horizontalLayout.layoutKey}
                orientation="horizontal"
                defaultLayout={horizontalLayout.defaultLayout}
                onLayoutChanged={horizontalLayout.onLayoutChanged}
              >
                {/* LEFT — account totals + realised-equity curve. */}
                <ResizablePanel
                  id="summary"
                  panelRef={summaryPanelRef}
                  collapsible
                  collapsedSize="0%"
                  defaultSize="21%"
                  minSize="16%"
                  maxSize="34%"
                  onResize={(size) =>
                    setSummaryCollapsed(size.asPercentage < 0.5)
                  }
                >
                  <WorkspacePanel>
                    <JournalSummaryPanel
                      summary={summary}
                      walletLabel={walletLabel}
                    />
                  </WorkspacePanel>
                </ResizablePanel>

                <ResizableHandle gap collapsed={summaryCollapsed} />

                {/* CENTER — the selected market, with your fills marked. */}
                <ResizablePanel id="chart" defaultSize="53%" minSize="30%">
                  <WorkspacePanel className="flex flex-col">
                    {resolvedMarket ? (
                      <BotLiveChartPanel
                        key={`${resolvedMarket}:${walletId}`}
                        network="mainnet"
                        market={resolvedMarket}
                        interval={interval}
                        intervals={CANDLE_INTERVALS}
                        onIntervalChange={setInterval}
                        automationConfig={null}
                        fills={marketFills}
                        trips={trips}
                        focusedTradeN={focusedTradeN}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
                        No trades recorded yet. They appear here once this
                        wallet has traded.
                      </div>
                    )}
                  </WorkspacePanel>
                </ResizablePanel>

                <ResizableHandle gap collapsed={marketsCollapsed} />

                {/* RIGHT — every market traded; click one to load it. */}
                <ResizablePanel
                  id="markets"
                  panelRef={marketsPanelRef}
                  collapsible
                  collapsedSize="0%"
                  defaultSize="26%"
                  minSize="18%"
                  maxSize="42%"
                  onResize={(size) =>
                    setMarketsCollapsed(size.asPercentage < 0.5)
                  }
                >
                  <WorkspacePanel className="flex flex-col">
                    <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-4 py-2.5">
                      <h2 className="text-xs font-semibold tracking-wide uppercase">
                        Markets
                      </h2>
                      <span className="text-[10px] text-muted-foreground">
                        {markets.length}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <BacktestMarketsTable
                        rows={marketRows}
                        state={marketSort}
                        selectedId={resolvedMarket}
                        onSelect={(row) => selectMarket(row.id)}
                        emptyLabel="No trades yet."
                      />
                    </div>
                  </WorkspacePanel>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            {/* The trades panel collapses to its own tab bar, not to nothing,
                so this gutter always has two visible panels to separate. */}
            <ResizableHandle gap />

            {/* BOTTOM — the selected market's trades. */}
            <ResizablePanel
              id="trades"
              panelRef={tradesPanelRef}
              collapsible
              collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
              defaultSize="32%"
              minSize="15%"
              onResize={() =>
                setTradesCollapsed(tradesPanelRef.current?.isCollapsed() ?? false)
              }
            >
              <WorkspacePanel>
                <StrategyTester
                  result={result}
                  startingEquity={startEquity ?? 0}
                  markPrice={markPrice}
                  selectedTradeN={focusedTradeN}
                  onSelectTrade={(trade) => setFocusedTradeN(trade?.n ?? null)}
                  emptyText="No finished trades in this market yet."
                  toggles={panelToggles}
                />
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ClientOnly>
    </div>
  )
}
