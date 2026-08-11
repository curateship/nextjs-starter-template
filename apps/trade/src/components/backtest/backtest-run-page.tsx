import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { BacktestChartPanel } from "@/components/backtest/backtest-chart-panel"
import { BacktestMarketsPanel } from "@/components/backtest/backtest-markets-panel"
import { BacktestStatsPanel } from "@/components/backtest/backtest-stats-panel"
import { BacktestTradesPanel } from "@/components/backtest/backtest-trades-panel"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  getBacktestErrorMessage,
  loadBacktestCoin,
} from "@/lib/api/backtests"
import type { CandleBar } from "@/lib/protocols/contracts"
import type {
  BacktestCoinSummary,
  BacktestFillMark,
  BacktestResult,
  BacktestSpecSnapshot,
  BacktestStatus,
  BacktestSummary,
  BacktestTrade,
} from "@/lib/trade/backtest/result"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"

/**
 * One backtest, laid out as a workspace: the settings it ran with on the left,
 * the chart in the middle, what it came to on the right, and its coins and
 * trades along the bottom.
 *
 * The same four panels as the Trade screen and the Automation Canvas, built on
 * the same parts — so resizing, collapsing, the reopen tabs and the remembered
 * layout behave identically on all three and only had to be got right once. A
 * results page that scrolled would be a fourth way of arranging this app.
 *
 * Every figure is a **dollar amount**, worked out when the run was saved.
 * Nothing here recalculates anything: a page doing its own sums would drift
 * from the row it is showing the moment either changed.
 */
export type BacktestRunView = {
  id: string
  name: string | null
  automationId: string
  automationName: string
  pinned: boolean
  archived: boolean
  stopRequested: boolean
  createdAt: number
  finishedAt: number | null
  spec: BacktestSpecSnapshot
  summary: BacktestSummary | null
  result: BacktestResult | null
}

export type BacktestCoinRow = {
  id: string
  marketKey: string
  symbol: string
  status: BacktestStatus
  progress: number
  progressNote: string
  skipReason: string | null
  error: string | null
  summary: BacktestCoinSummary | null
}

/** No focus ring on a panel divider — the same reason as the Trade workspace. */
const NO_RING = "focus-visible:ring-0"

export function BacktestRunPage({
  run,
  coins,
  openCoin,
}: {
  run: BacktestRunView
  coins: BacktestCoinRow[]
  /** `?run=<market key>` — which coin's chart is open. */
  openCoin: string | null
}) {
  const navigate = useNavigate()
  const desktop = useWideScreen()

  const horizontalLayout = useRememberedPanelLayout(
    tradePanelLayoutKey.backtestHorizontal
  )
  const verticalLayout = useRememberedPanelLayout(
    tradePanelLayoutKey.backtestVertical
  )

  const statsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const tradesPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const [statsCollapsed, setStatsCollapsed] = React.useState(false)
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)

  // Double-clicking a panel's blank space shuts it, the same gesture the Trade
  // workspace and the canvas use.
  const toggleStats = usePanelToggle(statsPanelRef)
  const toggleMarkets = usePanelToggle(marketsPanelRef)
  const statsDoubleClick = useBlankSpaceDoubleClick(toggleStats)
  const marketsDoubleClick = useBlankSpaceDoubleClick(toggleMarkets)
  const tradesDoubleClick = useBlankSpaceDoubleClick(
    usePanelToggle(tradesPanelRef)
  )

  /** The trade picked in the list, drawn heavier on the chart above it. */
  const [selectedTrade, setSelectedTrade] = React.useState<number | null>(null)

  // One coin's candles and trades, fetched when the address names one. Carries
  // the coin it answers, so a slow reply for a coin you have already left is
  // thrown away rather than drawn under the wrong name.
  const [chart, setChart] = React.useState<{
    key: string
    bars: CandleBar[]
    trades: BacktestTrade[]
    fills: BacktestFillMark[]
  } | null>(null)
  const [chartError, setChartError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!openCoin) return
    setChartError(null)
    try {
      const answer = await loadBacktestCoin(run.id, openCoin)
      setChart({
        key: openCoin,
        bars: answer.bars,
        trades: answer.trades,
        fills: answer.fills,
      })
    } catch (error) {
      setChart(null)
      setChartError(getBacktestErrorMessage(error))
    }
  }, [run.id, openCoin])

  React.useEffect(() => {
    void load()
  }, [load])

  // A trade number belongs to one coin's list, so switching coin has to let go
  // of it — otherwise trade 7 of ETH stays picked while BTC's chart is drawn.
  const [lastCoin, setLastCoin] = React.useState(openCoin)
  if (lastCoin !== openCoin) {
    setLastCoin(openCoin)
    setSelectedTrade(null)
  }

  const shown = chart?.key === openCoin ? chart : null
  const done = run.finishedAt !== null

  const openCoinInChart = (marketKey: string) =>
    void navigate({
      to: "/backtests/$groupId",
      params: { groupId: run.id },
      search: { run: marketKey },
    })

  const statsPanel = (
    <BacktestStatsPanel
      summary={run.summary}
      result={run.result}
      spec={run.spec}
      coinsTotal={coins.length}
      running={!done}
    />
  )
  const marketsPanel = (
    <BacktestMarketsPanel
      coins={coins}
      openCoin={openCoin}
      onOpenCoin={openCoinInChart}
    />
  )
  const chartPanel = (
    <BacktestChartPanel
      coins={coins}
      openCoin={openCoin}
      bars={shown?.bars ?? []}
      spec={run.spec}
      fills={shown?.fills ?? []}
      focusTrade={
        shown?.trades.find((trade) => trade.n === selectedTrade) ?? null
      }
      interval={run.spec.interval}
      loading={openCoin !== null && shown === null && chartError === null}
      error={chartError}
      live={!done}
      automationId={run.automationId}
      onRetry={() => void load()}
    />
  )

  const upper = desktop ? (
    <ResizablePanelGroup
      key={horizontalLayout.layoutKey}
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={horizontalLayout.defaultLayout}
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="stats"
        panelRef={statsPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="20%"
        minSize="14%"
        maxSize="32%"
        onResize={(size) => setStatsCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          className="flex flex-col"
          collapsed={statsCollapsed}
          onDoubleClick={statsDoubleClick}
        >
          {statsPanel}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={statsCollapsed} className={NO_RING} />
      <ResizablePanel id="chart" defaultSize="58%" minSize="30%">
        <WorkspacePanel className="relative flex min-w-0 flex-1 flex-col">
          {chartPanel}
          {/* Shown where a panel disappeared, so getting it back is findable
              without having to remember that the divider is still draggable —
              the same tab the trade screen puts there. */}
          {statsCollapsed ? (
            <PanelReopenTab
              side="left"
              label="Show the run's figures"
              onClick={toggleStats}
            />
          ) : null}
          {marketsCollapsed ? (
            <PanelReopenTab
              side="right"
              label="Show the results"
              onClick={toggleMarkets}
            />
          ) : null}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={marketsCollapsed} className={NO_RING} />
      <ResizablePanel
        id="markets"
        panelRef={marketsPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="22%"
        minSize="16%"
        maxSize="36%"
        onResize={(size) => setMarketsCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          className="flex flex-col"
          collapsed={marketsCollapsed}
          onDoubleClick={marketsDoubleClick}
        >
          {marketsPanel}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    // Narrow screens stack the three rather than squeezing them into a width
    // none of them fits in. The chart leads, because it is the thing you came
    // to look at.
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <WorkspacePanel className="flex h-[60vh] min-w-0 flex-col">
        {chartPanel}
      </WorkspacePanel>
      <WorkspacePanel className="flex flex-col">{marketsPanel}</WorkspacePanel>
      <WorkspacePanel className="flex flex-col">{statsPanel}</WorkspacePanel>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={verticalLayout.layoutKey}
        orientation="vertical"
        className="min-h-0 flex-1"
        defaultLayout={verticalLayout.defaultLayout}
        onLayoutChanged={verticalLayout.onLayoutChanged}
      >
        <ResizablePanel id="workspace" defaultSize="68%" minSize="35%">
          <div className="flex h-full min-h-0">{upper}</div>
        </ResizablePanel>
        {/* Keeps its gap even while the panel below is collapsed — that
            collapsed tab row is still a panel on screen, and this handle is
            what makes it draggable back open. */}
        <ResizableHandle gap className={NO_RING} />
        <ResizablePanel
          id="trades"
          panelRef={tradesPanelRef}
          defaultSize="32%"
          minSize="14%"
          maxSize="60%"
          // Down to its own header rather than to nothing, so its tabs and
          // their counts never disappear.
          collapsible
          collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
        >
          <WorkspacePanel className="flex flex-col" onDoubleClick={tradesDoubleClick}>
            <BacktestTradesPanel
              symbol={
                coins.find((coin) => coin.marketKey === openCoin)?.symbol ?? null
              }
              trades={shown?.trades ?? []}
              loading={openCoin !== null && shown === null}
              selected={selectedTrade}
              onSelect={setSelectedTrade}
            />
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>

    </div>
  )
}
