import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { FlowRunChartPanel } from "@/components/flow-run/flow-run-chart-panel"
import { FlowRunCoinsPanel } from "@/components/flow-run/flow-run-coins-panel"
import { FlowRunStatsPanel } from "@/components/flow-run/flow-run-stats-panel"
import { FlowRunTradesPanel } from "@/components/flow-run/flow-run-trades-panel"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { getCandlesErrorMessage, loadCandles } from "@/lib/api/trade/candles"
import {
  loadFlowRun,
  loadFlowRunCoin,
  type FlowRunReport,
} from "@/lib/api/trade/flow-runs"
import {
  buildGraphSeries,
  graphView,
  windowStats,
  WHOLE_RUN,
  type GraphWindow,
} from "@/lib/trade/backtest/graph"
import type { CandleBar } from "@/lib/protocols/contracts"
import type { ChartView } from "@/lib/trade/chart-view"
import { useRememberedChartView } from "@/components/trade/use-chart-view"
import type { LiveFillMark } from "@/lib/trade/live-trades"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { buildFlowRunEquity } from "@/lib/trade/flow-run/equity"
import { tradePanelIds, tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import {
  type TradePanelLayouts,
  useRememberedPanelLayoutInPlace,
} from "@/lib/trade/panel-layout"

/**
 * One switched-on flow, laid out as a workspace: its figures on the left, the
 * money line or a coin's candles in the middle, the coins on the right, and
 * every trade it has finished along the bottom.
 *
 * The same four panels as the Trade screen, the Automation canvas and the
 * backtest screen, built on the same parts — so resizing, collapsing, the
 * reopen tabs and the remembered layout only had to be got right once.
 *
 * **Nothing here is stored.** The money line is worked out from the run's own
 * fills every time the page reads, so it and the wallet can never drift apart.
 * A stored curve would be a second answer about somebody's money.
 */

/** How often a run that is still going is read again. */
const REFRESH_MS = 5_000

const NO_RING = "focus-visible:ring-0"

export function FlowRunPage({
  initial,
  openCoin,
  chartView: savedChartView,
  initialPanelLayouts,
}: {
  initial: FlowRunReport
  /** `?coin=<market key>` — which coin's chart is open. */
  openCoin: string | null
  /** The zoom the trading chart is remembered at, so both frame the same. */
  chartView: ChartView | null
  initialPanelLayouts: TradePanelLayouts
}) {
  // Shared with the trading screen on purpose: panning here carries over
  // there and back, and a ladder's rungs are in the same place on both.
  const chartView = useRememberedChartView(savedChartView)
  const navigate = useNavigate()
  const desktop = useWideScreen()

  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)
  const horizontalKey = tradePanelLayoutKey.flowRunHorizontal
  const verticalKey = tradePanelLayoutKey.flowRunVertical
  const horizontalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[horizontalKey],
    panelLayouts.layouts.current[horizontalKey],
    (layout) => panelLayouts.remember(horizontalKey, layout)
  )
  const verticalLayout = useRememberedPanelLayoutInPlace(
    tradePanelIds[verticalKey],
    panelLayouts.layouts.current[verticalKey],
    (layout) => panelLayouts.remember(verticalKey, layout)
  )

  const statsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const coinsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const tradesPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const [statsCollapsed, setStatsCollapsed] = React.useState(false)
  const [coinsCollapsed, setCoinsCollapsed] = React.useState(false)

  const toggleStatsPanel = usePanelToggle(statsPanelRef)
  const toggleStats = React.useCallback(() => {
    toggleStatsPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleStatsPanel])
  const toggleCoinsPanel = usePanelToggle(coinsPanelRef)
  const toggleCoins = React.useCallback(() => {
    toggleCoinsPanel()
    horizontalLayout.rememberLayout()
  }, [horizontalLayout, toggleCoinsPanel])
  const statsDoubleClick = useBlankSpaceDoubleClick(toggleStats)
  const coinsDoubleClick = useBlankSpaceDoubleClick(toggleCoins)
  const toggleTradesPanel = usePanelToggle(tradesPanelRef)
  const toggleTrades = React.useCallback(() => {
    toggleTradesPanel()
    verticalLayout.rememberLayout()
  }, [toggleTradesPanel, verticalLayout])
  const tradesDoubleClick = useBlankSpaceDoubleClick(toggleTrades)

  const [read, setRead] = React.useState({ from: initial, report: initial })
  // A fresh answer from the route loader replaces what is on screen. Adjusted
  // while rendering rather than in an effect: the alternative draws the old run
  // once before correcting itself, which on this page means somebody else's
  // figures for a frame.
  if (read.from !== initial) {
    setRead({ from: initial, report: initial })
  }
  const report = read.report
  // The server's own clock, sent with the answer. The head of the money line is
  // drawn at that moment, so reading the browser's would put the last point
  // somewhere the figures beside it do not agree with.
  const now = report.readAt

  // **Stops the moment the run does.** A stopped run's figures cannot change,
  // and a page quietly asking after a dead run all afternoon spends the
  // exchange's allowance on an answer nobody is waiting for.
  React.useEffect(() => {
    if (report.head.status === "stopped") return
    let live = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
      void loadFlowRun(report.head.id)
        .then((fresh) => {
          if (live) setRead((was) => ({ from: was.from, report: fresh }))
        })
        // A failed read leaves the last answer on screen rather than blanking
        // the page — the same rule the canvas chip follows.
        .catch(() => {})
        .finally(() => {
          if (live) timer = setTimeout(tick, REFRESH_MS)
        })
    }
    timer = setTimeout(tick, REFRESH_MS)
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [report.head.id, report.head.status])

  const [activeCoin, setActiveCoin] = React.useState<string | null>(openCoin)
  const [selectedTrade, setSelectedTrade] = React.useState<string | null>(null)
  const [view, setView] = React.useState<"graph" | "chart">(
    openCoin ? "chart" : "graph"
  )
  const [window, setWindow] = React.useState<GraphWindow>(WHOLE_RUN)

  const equity = React.useMemo(
    () =>
      buildFlowRunEquity({
        trades: report.trades,
        open: report.positions.map((position) => ({
          marketKey: position.marketKey,
          openedAt: position.openedAt,
          amountUsd: position.amountUsd,
          unrealisedUsd: position.unrealisedUsd ?? 0,
        })),
        capUsd: report.head.capUsd,
        startedAt: report.head.startedAt,
        endAt: report.head.stoppedAt ?? now,
      }),
    [report, now]
  )

  const graphSeries = React.useMemo(() => {
    if (equity.equity.length < 2) return null
    return buildGraphSeries(
      equity.equity,
      equity.inPlay,
      equity.runTrades,
      report.head.capUsd
    )
  }, [equity, report.head.capUsd])

  const stats = React.useMemo(() => {
    if (!graphSeries) return null
    const { stats: range } = graphView(graphSeries, window)
    return windowStats(
      graphSeries,
      equity.runTrades,
      range[0],
      range[1],
      report.head.capUsd
    )
  }, [graphSeries, equity.runTrades, window, report.head.capUsd])

  // One coin's candles and this run's own arrows on them. Carries the coin it
  // answers, so a slow reply for a coin you have already left is thrown away
  // rather than drawn under the wrong name.
  const [chart, setChart] = React.useState<{
    key: string
    working: boolean
    bars: CandleBar[]
    marks: LiveFillMark[]
    ladders: SmartLadder[]
  } | null>(null)
  const [chartError, setChartError] = React.useState<string | null>(null)
  const request = React.useRef(0)

  const interval = report.spec.strategy.interval
  const runId = report.head.id
  // The run summary and one coin's chart are separate reads. A coin can be
  // opened while it is still waiting, then gain a ladder on the next run
  // refresh. Reload on that exact transition so "Rungs placed" and the chart
  // cannot disagree until somebody changes coins.
  const activeCoinWorking =
    report.coins.find((coin) => coin.marketKey === activeCoin)?.working ?? false

  const load = React.useCallback(() => {
    if (!activeCoin) return Promise.resolve()
    const ticket = ++request.current
    return Promise.all([
      loadCandles(activeCoin, interval),
      loadFlowRunCoin(runId, activeCoin),
    ])
      .then(([candles, coin]) => {
        if (ticket !== request.current) return
        setChart({
          key: activeCoin,
          working: activeCoinWorking,
          bars: candles.candles,
          marks: coin.marks,
          // Only the ladders, drawn as rungs. A signal trade has no levels to
          // draw — its arrows are the indicators, which are already on the
          // chart behind this.
          ladders: coin.ladders.filter(
            (one): one is SmartLadder => one.kind === "dca"
          ),
        })
        setChartError(null)
      })
      .catch((error: unknown) => {
        if (ticket !== request.current) return
        setChart(null)
        setChartError(getCandlesErrorMessage(error))
      })
  }, [activeCoin, interval, runId, activeCoinWorking])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!activeCoin || activeCoin === openCoin) return
    void navigate({
      to: "/flow-runs/$runId",
      params: { runId },
      search: { coin: activeCoin },
      replace: true,
    })
  }, [activeCoin, navigate, openCoin, runId])

  const shown =
    chart?.key === activeCoin && chart.working === activeCoinWorking
      ? chart
      : null

  const openCoinInChart = (marketKey: string) => {
    setActiveCoin(marketKey)
    setSelectedTrade(null)
    setView("chart")
  }

  const statsPanel = (
    <FlowRunStatsPanel
      report={report}
      stats={stats}
      window={window}
      now={now}
    />
  )
  const coinsPanel = (
    <FlowRunCoinsPanel
      report={report}
      openCoin={activeCoin}
      onOpenCoin={openCoinInChart}
    />
  )
  const chartPanel = (
    <FlowRunChartPanel
      spec={report.spec}
      openCoin={activeCoin}
      coinLabel={
        report.coins.find((coin) => coin.marketKey === activeCoin)?.coin ?? null
      }
      bars={shown?.bars ?? []}
      marks={shown?.marks ?? []}
      ladders={shown?.ladders ?? []}
      graphSeries={graphSeries}
      runTrades={equity.runTrades}
      window={window}
      onWindow={setWindow}
      view={view}
      onSwapView={() => setView(view === "graph" ? "chart" : "graph")}
      readView={chartView.readView}
      onViewChange={chartView.onViewChange}
      loading={activeCoin !== null && shown === null && chartError === null}
      error={chartError}
      walletLabel={report.head.walletLabel}
      automationId={report.head.automationId}
      onRetry={() => void load()}
    />
  )

  const upper = desktop ? (
    <ResizablePanelGroup
      groupRef={horizontalLayout.groupRef}
      orientation="horizontal"
      className="min-h-0 flex-1"
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
          {statsCollapsed ? (
            <PanelReopenTab
              side="left"
              label="Show the run's figures"
              onClick={toggleStats}
            />
          ) : null}
          {coinsCollapsed ? (
            <PanelReopenTab
              side="right"
              label="Show the coins"
              onClick={toggleCoins}
            />
          ) : null}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={coinsCollapsed} className={NO_RING} />
      <ResizablePanel
        id="coins"
        panelRef={coinsPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="22%"
        minSize="16%"
        maxSize="36%"
        onResize={(size) => setCoinsCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          className="flex flex-col"
          collapsed={coinsCollapsed}
          onDoubleClick={coinsDoubleClick}
        >
          {coinsPanel}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <WorkspacePanel className="flex h-[60vh] min-w-0 flex-col">
        {chartPanel}
      </WorkspacePanel>
      <WorkspacePanel className="flex flex-col">{coinsPanel}</WorkspacePanel>
      <WorkspacePanel className="flex flex-col">{statsPanel}</WorkspacePanel>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        groupRef={verticalLayout.groupRef}
        orientation="vertical"
        className="min-h-0 flex-1"
        onLayoutChanged={verticalLayout.onLayoutChanged}
      >
        <ResizablePanel id="workspace" defaultSize="68%" minSize="35%">
          <div className="flex h-full min-h-0">{upper}</div>
        </ResizablePanel>
        <ResizableHandle gap className={NO_RING} />
        <ResizablePanel
          id="trades"
          panelRef={tradesPanelRef}
          defaultSize="32%"
          minSize="14%"
          maxSize="60%"
          collapsible
          collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
        >
          <WorkspacePanel
            className="flex flex-col"
            onDoubleClick={tradesDoubleClick}
          >
            <FlowRunTradesPanel
              trades={report.trades}
              selected={selectedTrade}
              onSelect={setSelectedTrade}
            />
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
