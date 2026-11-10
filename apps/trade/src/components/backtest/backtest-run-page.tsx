import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { BacktestChartPanel } from "@/components/backtest/backtest-chart-panel"
import { BacktestMarketsPanel } from "@/components/backtest/backtest-markets-panel"
import { BacktestStatsPanel } from "@/components/backtest/backtest-stats-panel"
import { BacktestTradesPanel } from "@/components/backtest/backtest-trades-panel"
import { OpenRunPanel } from "@/components/bots/bots-record"
import { FooterState } from "@/components/crm/record-frame"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { DASHBOARD_CARD_HEADER_HEIGHT_PX } from "@/lib/layout/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getBacktestErrorMessage,
  loadBacktestCoin,
  loadBacktestRunTrades,
  stopBacktest,
} from "@/lib/api/trade/backtests"
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
import { backtestMeter } from "@/lib/trade/backtest/progress"
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
import { useWideScreen } from "@/lib/layout/wide-screen"
import {
  firstBacktestMarket,
  firstBacktestTrade,
  readBacktestSelection,
  rememberBacktestSelection,
} from "@/lib/trade/backtest/selection"
import { showErrorToast } from "@/lib/toast/error-toast"
import { tradePanelIds, tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import {
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"

/**
 * The bottom panel folds down to its own header and its 2px of edge, not to
 * nothing, so its title never disappears. Kept here since the shell's
 * resizable panels stopped exporting it with the automation editor's bottom
 * panel (9 Nov 2026).
 */
const BOTTOM_COLLAPSED_HEIGHT = `${DASHBOARD_CARD_HEADER_HEIGHT_PX + 2}px`

/**
 * One backtest opened on the Bots dashboard (9 Nov 2026): its chart, or the
 * Graph of the pot over the whole run, fills the middle with its trades in a
 * panel under it, and the right panel holds its Figures, Results and Skipped
 * as tabs. The left panel stays the dashboard's page.
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
  initialPanelLayouts,
  heading,
  menu,
  onBack,
  onCoin,
  onOpenRecipe,
  frame,
}: {
  run: BacktestRunView
  coins: BacktestCoinRow[]
  /** `?coin=<market key>`: which coin's chart is open. */
  openCoin: string | null
  initialPanelLayouts: TradePanelLayouts
  /** The end of the middle's header: the button that reopens a shut right panel. */
  heading: React.ReactNode
  /** The backtest's ⋮, beside the right panel's tabs. */
  menu: React.ReactNode
  /** Back to the Backtests table. */
  onBack: () => void
  /** Puts the coin on the chart in the address; `push` when somebody picked it. */
  onCoin: (marketKey: string, push: boolean) => void
  /** Opens the recipe this ran, on its canvas. */
  onOpenRecipe: () => void
  /** The Bots dashboard's frame: the middle and the right panel. */
  frame: (panels: { header: React.ReactNode; middle: React.ReactNode; right: { label: string; content: React.ReactNode } }) => React.ReactNode
}) {
  const router = useRouter()
  const desktop = useWideScreen()

  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)
  const verticalKey = tradePanelLayoutKey.backtestVertical
  const verticalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[verticalKey],
    panelLayouts.layouts.current[verticalKey],
    (layout) => panelLayouts.remember(verticalKey, layout)
  )

  const tradesPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  // The right panel's tabs: the run in figures, then its two lists.
  const [rightTab, setRightTab] = React.useState<"figures" | "results" | "skipped">("figures")
  const toggleTradesPanel = usePanelToggle(tradesPanelRef)
  const toggleTrades = React.useCallback(() => {
    toggleTradesPanel()
    verticalLayout.rememberLayout()
  }, [toggleTradesPanel, verticalLayout])
  const tradesDoubleClick = useBlankSpaceDoubleClick(toggleTrades)

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
    run.spec.strategy.kind === "dca"
      ? run.spec.strategy.params.leverage
      : run.spec.strategy.kind === "emaGrid"
        ? run.spec.strategy.settings.grid.leverage
        : 1

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
    onCoin(activeCoin, false)
  }, [activeCoin, onCoin, openCoin])

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
  const meter = backtestMeter(coins)

  const openCoinInChart = (marketKey: string) => {
    setActiveCoin(marketKey)
    setSelectedTrade(null)
    // Picking a coin is asking to see it, so the panel swaps over to the
    // candles rather than leaving the click looking like it did nothing.
    setView("chart")
    onCoin(marketKey, true)
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
      skippedCount={
        new Set([
          ...coins
            .filter((coin) => coin.status === "skipped")
            .map((coin) => coin.marketKey),
          ...(run.result?.skipped ?? []).map((coin) => coin.marketKey),
        ]).size
      }
      failedCount={coins.filter((coin) => coin.status === "error").length}
      onShowSkipped={() => setRightTab("skipped")}
      timing={{
        createdAt: run.createdAt,
        finishedAt: run.finishedAt,
        failed: coins.some((coin) => coin.status === "error"),
      }}
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
      progress={meter.value}
      progressText={meter.text}
      running={!done}
    />
  )
  const marketsPanel = (
    <BacktestMarketsPanel
      tab={rightTab === "skipped" ? "skipped" : "results"}
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
      title={run.name ?? run.automationName}
      onBack={onBack}
      onOpenRecipe={onOpenRecipe}
      headerEnd={heading}
      chartToolbarPosition={panelLayouts.layouts.chartToolbarPosition}
      onChartToolbarPositionChange={panelLayouts.rememberChartToolbarPosition}
      onRetry={retryChart}
    />
  )

  const tradesPanel = (
    <BacktestTradesPanel
      symbol={coins.find((coin) => coin.marketKey === activeCoin)?.symbol ?? null}
      summary={coins.find((coin) => coin.marketKey === activeCoin)?.summary ?? null}
      trades={shown?.trades ?? []}
      loading={activeCoin !== null && shown === null && shownError === null}
      error={shownError}
      selected={selectedTrade}
      onRetry={retryChart}
      onSelect={selectTrade}
    />
  )

  // The chart over its trades, with a line between them to drag (Tyler, 9 Nov
  // 2026: "the chart has the trades in the bottom panel"). A narrow screen
  // stacks the two and scrolls.
  const middle = desktop ? (
    <ResizablePanelGroup
      groupRef={verticalLayout.groupRef}
      orientation="vertical"
      className="min-h-0 flex-1"
      onLayoutChanged={verticalLayout.onLayoutChanged}
    >
      <ResizablePanel id="workspace" defaultSize="68%" minSize="35%">
        <div className="relative flex h-full min-h-0 flex-col">{chartPanel}</div>
      </ResizablePanel>
      <ResizableHandle className={NO_RING} />
      <ResizablePanel
        id="trades"
        panelRef={tradesPanelRef}
        defaultSize="32%"
        minSize="14%"
        maxSize="60%"
        // Down to its own header rather than to nothing, so its title never disappears.
        collapsible
        collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
      >
        <div className="flex h-full min-h-0 flex-col" onDoubleClick={tradesDoubleClick}>
          {tradesPanel}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block!">
      <div className="flex h-[60vh] min-w-0 flex-col">{chartPanel}</div>
      <div className="flex flex-col border-t">{tradesPanel}</div>
    </ScrollArea>
  )

  const skippedCount = new Set([
    ...coins.filter((coin) => coin.status === "skipped").map((coin) => coin.marketKey),
    ...(run.result?.skipped ?? []).map((coin) => coin.marketKey),
  ]).size
  const right = (
    <OpenRunPanel
      tabs={[
        { value: "figures", label: "Figures" },
        { value: "results", label: "Results", count: coins.filter((coin) => coin.summary).length },
        { value: "skipped", label: "Skipped", count: skippedCount + coins.filter((coin) => coin.status === "error").length },
      ]}
      value={rightTab}
      onValueChange={(value) => setRightTab(value as typeof rightTab)}
      menu={menu}
      hideLabel="Hide the backtest"
      footer={
        <>
          <FooterState>{done ? "Finished" : run.stopRequested || stopping ? "Stopping" : "Running"}</FooterState>
          {!done ? (
            <Button type="button" variant="outline" disabled={run.stopRequested || stopping} onClick={askToStop}>
              {run.stopRequested || stopping ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
              Stop
            </Button>
          ) : null}
        </>
      }
    >
      {rightTab === "figures" ? statsPanel : marketsPanel}
    </OpenRunPanel>
  )

  return frame({ header: null, middle, right: { label: "Backtest", content: right } })
}
