import {
  ArrowLeftRightIcon,
  BotIcon,
  ChartLineIcon,
} from "lucide-react"

import { FlowRunControls } from "@/components/flow-run/flow-run-controls"
import * as React from "react"

import { FlowRunChartPanel } from "@/components/flow-run/flow-run-chart-panel"
import { FlowRunCoinsPanel, type CoinsTab } from "@/components/flow-run/flow-run-coins-panel"
import { FlowRunStatsPanel } from "@/components/flow-run/flow-run-stats-panel"
import { FlowRunTradesPanel } from "@/components/flow-run/flow-run-trades-panel"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import { OpenRunPanel } from "@/components/bots/bots-record"
import { TradeColumnsMenu } from "@/components/bots/trade-columns-menu"
import { TRADES_POPOVER_LIST_MAX, TradesPopover } from "@/components/bots/trades-popover"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { PanelCard } from "@/components/shared/panel-card"
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
import { saveRememberedChartView } from "@/lib/api/trade/chart-view"
import type { LiveFillMark } from "@/lib/trade/live-trades"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import { buildFlowRunEquity } from "@/lib/trade/flow-run/equity"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"

/**
 * One bot opened on the Bots dashboard: the money line or a coin's candles
 * fill the middle, and the right panel holds two folding cards, as an open
 * backtest's does (Tyler, 10 Nov 2026): Result, the run in figures, then
 * Trades, with Traded and Coins tabs, and Pause and Stop in its footer.
 * Pressing a coin charts it and opens its finished trades in a popover that
 * can be pinned and dragged, in place of the trades panel that sat under the
 * chart. The left panel stays the dashboard's page.
 *
 * **Nothing here is stored.** The money line is worked out from the run's own
 * fills every time the page reads, so it and the wallet can never drift apart.
 * A stored curve would be a second answer about somebody's money.
 */

/** How often a run that is still going is read again. */
const REFRESH_MS = 5_000

export function FlowRunPage({
  initial,
  openCoin,
  chartView: savedChartView,
  initialPanelLayouts,
  heading,
  menu,
  onCoin,
  onRunAgain,
  frame,
}: {
  initial: FlowRunReport
  /** `?coin=<market key>`: which coin's chart is open. */
  openCoin: string | null
  /** The zoom the trading chart is remembered at, so both frame the same. */
  chartView: ChartView | null
  initialPanelLayouts: TradePanelLayouts
  /** The end of the middle's header: the button that reopens a shut right panel. */
  heading: React.ReactNode
  /** The bot's ⋮, in the right panel's header. */
  menu: React.ReactNode
  /** Puts the coin on the chart in the address. */
  onCoin: (marketKey: string) => void
  /** Opens the new run "Run again" started. */
  onRunAgain: (runId: string) => void
  /** The Bots dashboard's frame: the middle and the right panel. */
  frame: (panels: { header: React.ReactNode; middle: React.ReactNode; right: { label: string; content: React.ReactNode } }) => React.ReactNode
}) {
  // Shared with the trading screen on purpose: panning here carries over
  // there and back, and a ladder's rungs are in the same place on both.
  const chartView = useRememberedChartView(savedChartView, saveRememberedChartView)
  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)

  // The Trades card's two lists, and its popover of one coin's trades.
  const [tradesTab, setTradesTab] = React.useState<CoinsTab>("traded")
  const [tradesOpen, setTradesOpen] = React.useState(false)

  const [read, setRead] = React.useState({ from: initial, report: initial })
  // A fresh answer from the route loader replaces what is on screen. Adjusted
  // while rendering rather than in an effect: the alternative draws the old run
  // once before correcting itself, which on this page means somebody else's
  // figures for a frame.
  if (read.from !== initial) {
    setRead({ from: initial, report: initial })
  }
  const actionPending = React.useRef(false)
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
          if (live && !actionPending.current)
            setRead((was) => ({ from: was.from, report: fresh }))
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
    onCoin(activeCoin)
  }, [activeCoin, onCoin, openCoin])

  const shown =
    chart?.key === activeCoin && chart.working === activeCoinWorking
      ? chart
      : null

  // Pressing a coin opens its trades and leaves the chart alone, as on a
  // backtest (Tyler, 10 Nov 2026: "just dont load the chart at all. Just open
  // the popover"). A trade pressed in the popover moves the chart to its coin.
  const [popCoin, setPopCoin] = React.useState<string | null>(null)
  const pressCoin = (marketKey: string) => {
    setPopCoin(marketKey)
    setTradesOpen(true)
  }
  const selectFromPopover = (tradeId: string | null) => {
    if (tradeId !== null && popCoin && popCoin !== activeCoin) {
      setActiveCoin(popCoin)
      setView("chart")
    }
    setSelectedTrade(tradeId)
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
      key={report.head.id}
      tab={tradesTab}
      report={report}
      openCoin={tradesOpen && popCoin ? popCoin : activeCoin}
      onOpenCoin={pressCoin}
      onRefresh={async () => {
        const fresh = await loadFlowRun(report.head.id)
        setRead((was) => ({ from: was.from, report: fresh }))
      }}
    />
  )
  const runControls = (
    <FlowRunControls
      key={report.head.id}
      onRunAgain={onRunAgain}
      onWorking={(working) => {
        actionPending.current = working
      }}
      head={report.head}
      onPaused={(paused) =>
        setRead((was) => ({
          ...was,
          report: { ...was.report, head: { ...was.report.head, paused } },
        }))
      }
      onRefresh={async () => {
        const fresh = await loadFlowRun(report.head.id)
        setRead((was) => ({ from: was.from, report: fresh }))
      }}
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
      onView={setView}
      readView={chartView.readView}
      onViewChange={chartView.onViewChange}
      loading={activeCoin !== null && shown === null && chartError === null}
      error={chartError}
      walletLabel={report.head.walletLabel}
      headerEnd={heading}
      chartToolbarPosition={panelLayouts.layouts.chartToolbarPosition}
      onChartToolbarPositionChange={panelLayouts.rememberChartToolbarPosition}
      onRetry={() => void load()}
    />
  )

  const coinPicked = report.coins.find((coin) => coin.marketKey === popCoin)
  const coinTrades = React.useMemo(
    () => report.trades.filter((trade) => trade.marketKey === popCoin),
    [report.trades, popCoin]
  )

  // The chart fills the middle; a coin's trades are in the popover.
  const middle = <div className="relative flex min-h-0 flex-1 flex-col">{chartPanel}</div>

  const tradesCard = (
    <PanelCard storageId="bot-trades" icon={<ArrowLeftRightIcon />} title="Trades">
      <DashboardTabs
        value={tradesTab}
        onValueChange={(value) => setTradesTab(value as CoinsTab)}
        tabs={[
          { value: "traded", label: "Traded" },
          { value: "coins", label: "Coins" },
        ]}
      />
      {coinsPanel}
    </PanelCard>
  )

  const right = (
    <OpenRunPanel title="Bot" icon={BotIcon} menu={menu} hideLabel="Hide the bot" footer={runControls}>
      <PanelCard storageId="bot-result" icon={<ChartLineIcon />} title="Result">
        {statsPanel}
      </PanelCard>
      <TradesPopover
        open={tradesOpen && coinPicked !== undefined}
        onOpenChange={setTradesOpen}
        anchor={tradesCard}
        menu={
          <TradeColumnsMenu
            kind="bot"
            hidden={panelLayouts.layouts.hiddenTradeColumns.bot ?? []}
            onChange={(hidden) => panelLayouts.rememberHiddenTradeColumns("bot", hidden)}
          />
        }
      >
        {(headerAction) => (
          <FlowRunTradesPanel
            title={`${coinPicked?.coin ?? "Coin"} trades`}
            trades={coinTrades}
            selected={popCoin === activeCoin ? selectedTrade : null}
            onSelect={selectFromPopover}
            headerAction={headerAction}
            hidden={panelLayouts.layouts.hiddenTradeColumns.bot}
            listClassName={TRADES_POPOVER_LIST_MAX}
          />
        )}
      </TradesPopover>
    </OpenRunPanel>
  )

  return frame({ header: null, middle, right: { label: "Bot", content: right } })
}
