import * as React from "react"
import { ClientOnly, useRouter } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  BacktestMarketsTable,
  sortMarketRows,
  useMarketSort,
} from "@/components/backtest/backtest-markets-table"
import { truncateWords } from "@/components/backtest/backtest-format"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Badge } from "@/components/ui/badge"
import { StrategyTester } from "@/components/backtest/strategy-tester"
import { BotLiveChartPanel } from "@/components/bots/bot-live-chart-panel"
import { buildBotMarketRows } from "@/components/bots/bot-market-rows"
import { buildBotResult } from "@/components/bots/bot-result"
import { BotSummaryPanel } from "@/components/bots/bot-summary-panel"
import { useBotLive } from "@/components/bots/use-bot-live"
import { WorkerOfflineBanner } from "@/components/bots/worker-offline-banner"
import { IconButton } from "@/components/icon-button"
import {
  ArrowLeftIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { loadBotDetail, type BotDetailResponse } from "@/lib/api/bots"
import { isAutomationConfig } from "@/lib/strategies/strategy-config"
import type { CandleInterval } from "@/lib/hl/ws"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { usePanelLayout } from "@/lib/use-panel-layout"

/**
 * Read-only viewer for one saved bot run — the same four panels as the
 * editor's Bot mode (summary · chart · markets · trades), showing the filed
 * record. A run is finished when it lands here (keeping closes + stops it);
 * the live current run is managed in the automation editor's Bot tab.
 */
export function BotWorkspace({
  botId,
  initial,
}: {
  botId: string
  initial: BotDetailResponse
}) {
  const router = useRouter()
  const { data } = useIntervalLoader(() => loadBotDetail(botId), initial)
  const { bot, states, stats, trades } = data

  const automationConfig = React.useMemo(
    () => (isAutomationConfig(bot.params) ? bot.params : null),
    [bot.params]
  )

  const [selectedMarket, setSelectedMarket] = React.useState(
    bot.markets[0] ?? ""
  )
  React.useEffect(() => {
    if (!bot.markets.includes(selectedMarket) && bot.markets[0]) {
      setSelectedMarket(bot.markets[0])
    }
  }, [bot.markets, selectedMarket])

  const live = useBotLive(data, selectedMarket)
  const [focusedTradeN, setFocusedTradeN] = React.useState<number | null>(null)
  const marketSort = useMarketSort("net")

  const marketRows = React.useMemo(
    () =>
      sortMarketRows(
        buildBotMarketRows(bot.markets, states, trades),
        marketSort.sortColumn,
        marketSort.sortDirection
      ),
    [bot.markets, states, trades, marketSort.sortColumn, marketSort.sortDirection]
  )

  // Per-market equity base: cash minus what this market realized.
  const closedPnl = live.trips
    .filter((trip) => !trip.open)
    .reduce((sum, trip) => sum + trip.pnl, 0)
  const startingEquity =
    live.state?.paper_cash != null && live.state.paper_cash - closedPnl > 0
      ? live.state.paper_cash - closedPnl
      : (bot.paper_starting_equity ?? 10_000)
  const result = React.useMemo(
    () =>
      buildBotResult(live.trips, live.marketTrades, live.state, startingEquity),
    [live.trips, live.marketTrades, live.state, startingEquity]
  )

  // Collapsible panels, persisted — the backtest group workspace's pattern.
  const summaryPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const tradesPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const [summaryCollapsed, setSummaryCollapsed] = React.useState(false)
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)
  const [tradesCollapsed, setTradesCollapsed] = React.useState(false)
  const horizontalLayout = usePanelLayout("bot-run-workspace-horizontal")
  const verticalLayout = usePanelLayout("bot-run-workspace-vertical")
  const togglePanel = (ref: React.RefObject<PanelImperativeHandle | null>) => {
    const panel = ref.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/60 dark:bg-background">
      {/* A saved run is a history record — same header anatomy as the
          backtest group workspace. Strategy editing lives on the automation's
          canvas, never here. */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
        <IconButton
          label="Back to bot runs"
          onClick={() => void router.navigate({ to: "/bots" })}
        >
          <ArrowLeftIcon className="size-4" />
        </IconButton>
        <Breadcrumbs
          crumbs={[
            { label: "Bot", to: "/bots" },
            { label: truncateWords(bot.name, 12) },
          ]}
        />
        <div className="flex-1" />
        <Badge variant="secondary" className="font-medium">
          {bot.markets.length} {bot.markets.length === 1 ? "market" : "markets"}
        </Badge>
        <div className="ml-1 flex items-center gap-0.5">
          <IconButton
            label={
              summaryCollapsed ? "Show summary panel" : "Hide summary panel"
            }
            onClick={() => togglePanel(summaryPanelRef)}
          >
            {summaryCollapsed ? (
              <PanelLeftOpenIcon className="size-4" />
            ) : (
              <PanelLeftCloseIcon className="size-4" />
            )}
          </IconButton>
          <IconButton
            label={
              marketsCollapsed ? "Show markets panel" : "Hide markets panel"
            }
            onClick={() => togglePanel(marketsPanelRef)}
          >
            {marketsCollapsed ? (
              <PanelRightOpenIcon className="size-4" />
            ) : (
              <PanelRightCloseIcon className="size-4" />
            )}
          </IconButton>
          <IconButton
            label={tradesCollapsed ? "Show trades panel" : "Hide trades panel"}
            onClick={() => togglePanel(tradesPanelRef)}
          >
            {tradesCollapsed ? (
              <ChevronsUpIcon className="size-4" />
            ) : (
              <ChevronsDownIcon className="size-4" />
            )}
          </IconButton>
        </div>
      </div>
      {!data.workerOnline ? (
        <WorkerOfflineBanner className="border-b px-4 py-1.5 text-xs" />
      ) : null}

      <ClientOnly fallback={null}>
        <div className="min-h-0 flex-1 p-2 md:p-3">
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
                    <BotSummaryPanel
                      bot={bot}
                      state={live.state}
                      stats={stats}
                      openOrders={live.openOrders}
                      selectedMarket={selectedMarket}
                      markPrice={live.markPrice}
                      dayChangePct={live.dayChangePct}
                    />
                  </WorkspacePanel>
                </ResizablePanel>
                <ResizableHandle gap />
                <ResizablePanel id="chart" defaultSize="53%" minSize="30%">
                  <WorkspacePanel className="flex flex-col">
                    <BotLiveChartPanel
                      key={selectedMarket}
                      network={live.network}
                      market={selectedMarket}
                      interval={
                        (automationConfig?.interval ?? "15m") as CandleInterval
                      }
                      automationConfig={automationConfig}
                      fills={live.marketTrades}
                      trips={live.trips}
                      focusedTradeN={focusedTradeN}
                    />
                  </WorkspacePanel>
                </ResizablePanel>
                <ResizableHandle gap />
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
                        {bot.markets.length}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <BacktestMarketsTable
                        rows={marketRows}
                        state={marketSort}
                        selectedId={selectedMarket}
                        onSelect={(row) => setSelectedMarket(row.id)}
                        emptyLabel="No markets."
                      />
                    </div>
                  </WorkspacePanel>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle gap />
            <ResizablePanel
              id="trades"
              panelRef={tradesPanelRef}
              collapsible
              collapsedSize="0%"
              defaultSize="32%"
              minSize="15%"
              onResize={(size) => setTradesCollapsed(size.asPercentage < 0.5)}
            >
              <WorkspacePanel>
                <StrategyTester
                  result={result}
                  startingEquity={startingEquity}
                  markPrice={live.markPrice}
                  selectedTradeN={focusedTradeN}
                  onSelectTrade={(trade) => setFocusedTradeN(trade?.n ?? null)}
                />
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ClientOnly>
    </div>
  )
}
