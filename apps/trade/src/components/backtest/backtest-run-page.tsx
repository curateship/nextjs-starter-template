import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
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
  loadBacktestRunTrades,
  stopBacktest,
} from "@/lib/api/backtests"
import {
  buildGraphSeries,
  graphView,
  windowStats,
  WHOLE_RUN,
  type BacktestRunTrade,
  type GraphWindow,
} from "@/lib/trade/backtest/graph"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import type { CandleBar } from "@/lib/protocols/contracts"
import { resultSummary, stoppedEarly } from "@/lib/trade/backtest/result"
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
import { showErrorToast } from "@/lib/toast/error-toast"
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
  const router = useRouter()
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

  // Which picture the middle panel is showing: the Graph, which is the pot's
  // line over the whole run, or the Chart, which is one coin's candles.
  //
  // A run opens on the Graph, because what the money did over the whole window
  // is the first question anybody asks of a result — and at the size it used
  // to be drawn, in the panel on the left, its timeline could not be read.
  //
  // Except when the address already names a coin: that is somebody following a
  // link to that coin's candles, and answering with a different chart would
  // ignore what they asked for.
  const [view, setView] = React.useState<"graph" | "chart">(
    openCoin ? "chart" : "graph"
  )

  // **A run that never reached the end of its window says so out loud.**
  //
  // Every figure on this screen is then about less time than was asked for,
  // and a run cut off while the pot is down reports that low point as its
  // result — a strategy that finishes well ahead can print almost nothing. It
  // used to be one line inside a list at the bottom of the left panel, below
  // the fold and behind a toggle, under the very headline it was warning
  // about. A toast cannot be scrolled past, and it stays until it is dismissed.
  // Once per run, not once per render. The summary arrives as a fresh object
  // every time the loader answers, so keying the effect on it would re-raise
  // the toast on each revalidation — a warning that keeps reappearing while
  // you are reading is one you start clicking away without reading.
  const warnedRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (warnedRef.current === run.id) return
    if (!stoppedEarly(run.summary)) return
    warnedRef.current = run.id
    showErrorToast(
      "This backtest stopped before the end of its window, so every figure here covers less time than it was set to. Run it again before trusting the result."
    )
  }, [run.id, run.summary])

  // How much the run borrows. The pot's line records the MARGIN each position
  // put up, not what it bought, so at 2× the money in the market is twice the
  // saved figure — and reading it straight said $529 where $1,058 was at work.
  // A signals run does not borrow, so it stands at 1.
  const leverage =
    run.spec.strategy.kind === "dca" ? run.spec.strategy.params.leverage : 1

  // Which stretch of the run every figure on the screen is answering for. It
  // lives here rather than inside the graph because the tiles on the left have
  // to move with it — two copies of this would be two answers to one question.
  const [window, setWindow] = React.useState<GraphWindow>(WHOLE_RUN)

  // Every round trip the run made, in one request. The figures that need them —
  // win rate, profit factor, how long it was in the market, which coins made
  // money — cannot be windowed without them, and the coin-at-a-time door would
  // be one request per coin to draw one panel.
  // Carries the run it answers, the same way the coin fetch below does. Opening
  // a second run reuses this page rather than rebuilding it, so without the id
  // the previous run's trades would be counted against the new run's pot until
  // the new ones landed — a second or two of figures belonging to neither.
  const [runTrades, setRunTrades] = React.useState<{
    runId: string
    trades: BacktestRunTrade[]
  } | null>(null)
  React.useEffect(() => {
    let live = true
    void loadBacktestRunTrades(run.id)
      .then((answer) => {
        if (live) setRunTrades({ runId: run.id, trades: answer.trades })
      })
      .catch(() => {
        // A run whose trades will not load still has a pot to draw and a
        // summary to read; those tiles show a dash. Nothing here is worth
        // taking the page down for.
        if (live) setRunTrades(null)
      })
    return () => {
      live = false
    }
  }, [run.id])
  const trades = runTrades?.runId === run.id ? runTrades.trades : null

  const graphSeries = React.useMemo(() => {
    if (!run.result || run.result.equity.length < 2) return null
    return buildGraphSeries(
      run.result.equity,
      run.result.inPlay,
      trades,
      run.spec.startingUsd
    )
  }, [run.result, run.spec.startingUsd, trades])

  const graphStats = React.useMemo(() => {
    if (!graphSeries) return null
    const { stats } = graphView(graphSeries, window)
    return windowStats(
      graphSeries,
      trades,
      stats[0],
      stats[1],
      run.spec.startingUsd,
      // The same borrowing the graph's own reading uses, so the tiles and the
      // tooltip cannot disagree about how much of the wallet is in the market.
      leverage
    )
  }, [graphSeries, trades, window, run.spec.startingUsd, leverage])

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

  /**
   * Believed from the click until the page is read again.
   *
   * The run's own row only changes when the walk notices between chunks, which
   * can be a few seconds, and a button still saying "Stop" in the meantime
   * reads as a press that did nothing.
   */
  const [stopping, setStopping] = React.useState(false)
  const askToStop = () => {
    setStopping(true)
    void stopBacktest(run.id)
      .then(() => router.invalidate())
      .catch((error: unknown) => {
        // Back to a button that can be pressed: nothing was asked to stop.
        setStopping(false)
        showErrorToast(getBacktestErrorMessage(error))
      })
  }

  const shown = chart?.key === activeCoin ? chart : null
  const shownError = chartError?.key === activeCoin ? chartError.message : null
  const done = run.finishedAt !== null

  const openCoinInChart = (marketKey: string) => {
    setActiveCoin(marketKey)
    setSelectedTrade(null)
    // Picking a coin is asking to see it, so the panel swaps over to the
    // candles rather than leaving the click looking like it did nothing.
    setView("chart")
    void navigate({
      to: "/backtests/$groupId",
      params: { groupId: run.id },
      search: { run: marketKey },
    })
  }

  const selectTrade = (trade: number | null) => {
    setSelectedTrade(trade)
    // Same reason as picking a coin: a trade is only worth picking on the
    // chart that draws it.
    if (trade !== null) setView("chart")
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
      series={graphSeries}
      stats={graphStats}
      window={window}
      onWindow={setWindow}
      coinsTotal={coins.length}
      running={!done}
      stopRequested={run.stopRequested || stopping}
      onStop={askToStop}
    />
  )
  const marketsPanel = (
    <BacktestMarketsPanel
      coins={coins}
      skipped={run.result?.skipped ?? []}
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
      graphSeries={graphSeries}
      runTrades={trades}
      leverage={leverage}
      window={window}
      onWindow={setWindow}
      view={view}
      onSwapView={() => setView(view === "graph" ? "chart" : "graph")}
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
          <WorkspacePanel
            className="flex flex-col"
            onDoubleClick={tradesDoubleClick}
          >
            <BacktestTradesPanel
              symbol={
                coins.find((coin) => coin.marketKey === activeCoin)?.symbol ??
                null
              }
              summary={
                coins.find((coin) => coin.marketKey === activeCoin)?.summary ??
                null
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
