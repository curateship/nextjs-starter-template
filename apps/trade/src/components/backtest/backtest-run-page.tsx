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
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import type { CandleBar } from "@/lib/protocols/contracts"
import { resultSummary } from "@/lib/trade/backtest/result"
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
import {
  firstBacktestMarket,
  firstBacktestTrade,
  readBacktestSelection,
  rememberBacktestSelection,
} from "@/lib/trade/backtest/selection"
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

  const fallbackCoin = React.useMemo(() => firstBacktestMarket(coins), [coins])
  const [activeCoin, setActiveCoin] = React.useState(
    () => openCoin ?? fallbackCoin
  )

  // A bare visit starts on the first result. Returning to this run restores
  // the last result instead, before the browser paints the page.
  useEffectBeforePaint(() => {
    const remembered = readBacktestSelection(run.id)
    const rememberedCoin = coins.some(
      (coin) => coin.marketKey === remembered?.marketKey
    )
      ? remembered!.marketKey
      : null
    setActiveCoin(openCoin ?? rememberedCoin ?? fallbackCoin)
  }, [coins, fallbackCoin, openCoin, run.id])

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
  const [chartError, setChartError] = React.useState<{
    key: string
    message: string
  } | null>(null)
  const loadRequest = React.useRef(0)

  const load = React.useCallback(() => {
    if (!activeCoin) return Promise.resolve()
    const request = ++loadRequest.current
    return Promise.resolve()
      .then(() => {
        if (request === loadRequest.current) setChartError(null)
        return loadBacktestCoin(run.id, activeCoin)
      })
      .then((answer) => {
        if (request !== loadRequest.current) return
        const remembered = readBacktestSelection(run.id)
        const sameRememberedMarket = remembered?.marketKey === activeCoin
        const rememberedTradeIsValid = answer.trades.some(
          (trade) => trade.n === remembered?.trade
        )
        const nextTrade = sameRememberedMarket
          ? remembered?.trade === null || rememberedTradeIsValid
            ? remembered.trade
            : firstBacktestTrade(answer.trades)
          : firstBacktestTrade(answer.trades)
        setChart({
          key: activeCoin,
          bars: answer.bars,
          trades: answer.trades,
          fills: answer.fills,
        })
        setSelectedTrade(nextTrade)
        rememberBacktestSelection(run.id, {
          marketKey: activeCoin,
          trade: nextTrade,
        })
      })
      .catch((error: unknown) => {
        if (request !== loadRequest.current) return
        setChart(null)
        setChartError({
          key: activeCoin,
          message: getBacktestErrorMessage(error),
        })
      })
  }, [run.id, activeCoin])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!activeCoin || activeCoin === openCoin) return
    void navigate({
      to: "/backtests/$groupId",
      params: { groupId: run.id },
      search: { run: activeCoin },
      replace: true,
    })
  }, [activeCoin, navigate, openCoin, run.id])

  const shown = chart?.key === activeCoin ? chart : null
  const shownError = chartError?.key === activeCoin ? chartError.message : null
  const done = run.finishedAt !== null

  const openCoinInChart = (marketKey: string) => {
    setActiveCoin(marketKey)
    setSelectedTrade(null)
    void navigate({
      to: "/backtests/$groupId",
      params: { groupId: run.id },
      search: { run: marketKey },
    })
  }

  const selectTrade = (trade: number | null) => {
    setSelectedTrade(trade)
    if (activeCoin) {
      rememberBacktestSelection(run.id, { marketKey: activeCoin, trade })
    }
  }

  const retryChart = () => {
    setChartError(null)
    void load()
  }

  const statsPanel = (
    <BacktestStatsPanel
      // Nothing tested is not a result. A run stopped before it started still
      // writes a summary — same ending code either way — and drawn as figures
      // it reads as a finished backtest that found nothing rather than one that
      // never ran. Same reason as the canvas panel's own guard.
      summary={resultSummary(run.summary)}
      result={run.result}
      spec={run.spec}
      coinsTotal={coins.length}
      running={!done}
    />
  )
  const marketsPanel = (
    <BacktestMarketsPanel
      coins={coins}
      openCoin={activeCoin}
      onOpenCoin={openCoinInChart}
    />
  )
  const chartPanel = (
    <BacktestChartPanel
      coins={coins}
      openCoin={activeCoin}
      bars={shown?.bars ?? []}
      spec={run.spec}
      fills={shown?.fills ?? []}
      trades={shown?.trades ?? []}
      focusTrade={
        shown?.trades.find((trade) => trade.n === selectedTrade) ?? null
      }
      interval={run.spec.interval}
      loading={activeCoin !== null && shown === null && shownError === null}
      error={shownError}
      live={!done}
      automationId={run.automationId}
      onRetry={retryChart}
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
                coins.find((coin) => coin.marketKey === activeCoin)?.symbol ?? null
              }
              trades={shown?.trades ?? []}
              loading={activeCoin !== null && shown === null}
              selected={selectedTrade}
              onSelect={selectTrade}
            />
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>

    </div>
  )
}
