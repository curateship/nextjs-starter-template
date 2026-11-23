import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowLeftRightIcon,
  ChartLineIcon,
  CircleSlashIcon,
  FlaskConicalIcon,
  Loader2Icon,
} from "lucide-react"

import { BacktestChartPanel } from "@/components/backtest/backtest-chart-panel"
import { BacktestMarketsPanel } from "@/components/backtest/backtest-markets-panel"
import { listSkipped } from "@/components/backtest/skipped-coins"
import { BacktestStatsPanel } from "@/components/backtest/backtest-stats-panel"
import { BacktestTradesPanel } from "@/components/backtest/backtest-trades-panel"
import { useBacktestFigures } from "@/components/backtest/use-backtest-figures"
import { useMarketIcons } from "@/components/backtest/use-market-icons"
import { OpenRunPanel } from "@/components/bots/bots-record"
import { TradeColumnsMenu } from "@/components/bots/trade-columns-menu"
import { TRADES_POPOVER_LIST_MAX, TradesPopover } from "@/components/bots/trades-popover"
import { FooterState } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { useTradePanelLayouts } from "@/components/trade/use-panel-layouts"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  getBacktestErrorMessage,
  loadBacktestCoin,
  loadBacktestCoinTrades,
  stopBacktest,
} from "@/lib/api/trade/backtests"
import { plural } from "@/lib/format/plural"
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
  firstBacktestMarket,
  readBacktestSelection,
  rememberBacktestSelection,
} from "@/lib/trade/backtest/selection"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { ChartView } from "@/lib/trade/chart-view"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"

/**
 * One backtest opened on the Bots dashboard: its chart, or the Graph of the
 * pot over the whole run, fills the middle, and the right panel holds two
 * folding cards (Tyler, 10 Nov 2026): Result, the run in figures, then
 * Trades, its coins with Traded and Skipped tabs. Pressing a coin charts it
 * and opens its trades in a popover that can be pinned and dragged, in place
 * of the trades panel that sat under the chart. The left panel stays the
 * dashboard's page.
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

export function BacktestRunPage({
  run,
  coins,
  openCoin,
  chartView,
  initialPanelLayouts,
  heading,
  menu,
  onCoin,
  frame,
}: {
  run: BacktestRunView
  coins: BacktestCoinRow[]
  /** `?coin=<market key>`: which coin's chart is open. */
  openCoin: string | null
  /** The Trade chart's remembered zoom and position, which a coin's chart opens at. */
  chartView: ChartView | null
  initialPanelLayouts: TradePanelLayouts
  /** The end of the middle's header: the button that reopens a shut right panel. */
  heading: React.ReactNode
  /** The backtest's ⋮, in the right panel's header. */
  menu: React.ReactNode
  /** Puts the coin on the chart in the address; `push` when somebody picked it. */
  onCoin: (marketKey: string, push: boolean) => void
  /** The Bots dashboard's frame: the middle and the right panel. */
  frame: (panels: { header: React.ReactNode; middle: React.ReactNode; right: { label: string; content: React.ReactNode } }) => React.ReactNode
}) {
  const router = useRouter()
  const panelLayouts = useTradePanelLayouts(initialPanelLayouts)

  // The Trades card's popover of one coin's trades.
  const [tradesOpen, setTradesOpen] = React.useState(false)

  const fallbackCoin = React.useMemo(() => firstBacktestMarket(coins), [coins])
  // The Trades card's coin logos, read from each exchange's market list.
  const coinKeys = React.useMemo(() => coins.map((coin) => coin.marketKey), [coins])
  const icons = useMarketIcons(coinKeys)
  // The Skipped card's coins, counted in its heading from the same list it shows.
  const skippedList = React.useMemo(() => listSkipped(coins, run.result?.skipped ?? []), [coins, run.result])
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

  const { leverage, window, setWindow, trades, graphSeries, graphStats } = useBacktestFigures(run)

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
        // No trade is picked for you (Tyler, 10 Nov 2026: "Dont make clicking
        // on market open the market first trade"): the chart opens at your
        // saved view, and only a trade you picked, on this market, comes back.
        const nextTrade =
          sameRememberedMarket && remembered.trade !== null && rememberedTradeIsValid ? remembered.trade : null
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
  // Stopping throws away the rest of the walk, so it asks first, as a bot's
  // Stop does (Tyler's polish pick, 10 Nov 2026).
  const [stopAsked, setStopAsked] = React.useState(false)
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

  // **Pressing a coin in the Trades card opens its trades and nothing else.**
  // The chart stays as it is (Tyler, 10 Nov 2026: "Dont make clicking on
  // market open the market first trade", then "if its not first trade then
  // just dont load the chart at all. Just open the popover"). The chart moves
  // to the coin only when one of its trades is pressed in the popover.
  const [popCoin, setPopCoin] = React.useState<string | null>(null)
  const [popRead, setPopRead] = React.useState<
    { key: string; trades: BacktestTrade[] } | { key: string; error: string } | null
  >(null)
  const [popAttempt, setPopAttempt] = React.useState(0)
  // A finished run's trades never change, so a coin opened once opens again
  // at once instead of asking the server a second time.
  const popCache = React.useRef(new Map<string, BacktestTrade[]>())
  const runDone = run.finishedAt !== null
  React.useEffect(() => {
    // The coin on the chart already has its trades read.
    if (!popCoin || popCoin === activeCoin) return
    const cached = runDone ? popCache.current.get(popCoin) : undefined
    if (cached) {
      setPopRead({ key: popCoin, trades: cached })
      return
    }
    let live = true
    loadBacktestCoinTrades(run.id, popCoin)
      .then((answer) => {
        if (runDone) popCache.current.set(popCoin, answer.trades)
        if (live) setPopRead({ key: popCoin, trades: answer.trades })
      })
      .catch((error: unknown) => {
        if (live) setPopRead({ key: popCoin, error: getBacktestErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [run.id, popCoin, activeCoin, popAttempt, runDone])
  const popIsChart = popCoin !== null && popCoin === activeCoin
  const popAnswer = popRead?.key === popCoin ? popRead : null
  const popTrades = popIsChart ? (shown?.trades ?? []) : popAnswer && "trades" in popAnswer ? popAnswer.trades : []
  const popError = popIsChart ? shownError : popAnswer && "error" in popAnswer ? popAnswer.error : null
  const popLoading = popCoin !== null && (popIsChart ? shown === null && shownError === null : popAnswer === null)

  const pressCoin = (marketKey: string) => {
    setPopCoin(marketKey)
    setTradesOpen(true)
  }

  // A trade pressed in the popover: the chart moves to its coin, if it is not
  // there already, and frames it.
  const selectFromPopover = (trade: number | null) => {
    if (popCoin && popCoin !== activeCoin) {
      // Read back by the coin's load, which then frames this trade.
      rememberBacktestSelection(run.id, { marketKey: popCoin, trade })
      setActiveCoin(popCoin)
      setSelectedTrade(trade)
      setView("chart")
      onCoin(popCoin, true)
      return
    }
    selectTrade(trade)
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
      stats={graphStats}
      window={window}
      coinsTotal={coins.length}
      progress={meter.value}
      progressText={meter.text}
      running={!done}
    />
  )
  const marketsPanel = (
    <BacktestMarketsPanel
      tab="traded"
      coins={coins}
      icons={icons}
      skipped={run.result?.skipped ?? []}
      openCoin={tradesOpen && popCoin ? popCoin : activeCoin}
      onOpenCoin={pressCoin}
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
      onView={setView}
      interval={run.spec.interval}
      loading={activeCoin !== null && shown === null && shownError === null}
      error={shownError}
      live={!done}
      headerEnd={heading}
      savedView={chartView}
      chartToolbarPosition={panelLayouts.layouts.chartToolbarPosition}
      onChartToolbarPositionChange={panelLayouts.rememberChartToolbarPosition}
      onRetry={retryChart}
    />
  )

  const coinPicked = coins.find((coin) => coin.marketKey === popCoin)

  // The chart fills the middle; a coin's trades are in the popover.
  const middle = <div className="relative flex min-h-0 flex-1 flex-col">{chartPanel}</div>

  const tradesCard = (
    <PanelCard storageId="backtest-trades" icon={<ArrowLeftRightIcon />} title="Trades">
      {marketsPanel}
    </PanelCard>
  )
  // The coins that produced nothing, in a card of their own under Trades
  // (Tyler, 10 Nov 2026: "Put the skipped markets into its own card and out
  // of the tab").
  const skippedCard = (
    <PanelCard
      storageId="backtest-skipped"
      icon={<CircleSlashIcon />}
      title="Skipped"
      badge={
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {skippedList.length} {plural(skippedList.length, "coin", "coins")}
        </span>
      }
    >
      <BacktestMarketsPanel
        tab="skipped"
        coins={coins}
        skipped={run.result?.skipped ?? []}
        openCoin={null}
        onOpenCoin={() => {}}
      />
    </PanelCard>
  )

  const right = (
    <OpenRunPanel
      title="Backtest"
      icon={FlaskConicalIcon}
      menu={menu}
      hideLabel="Hide the backtest"
      footer={
        <>
          <FooterState>{done ? "Finished" : run.stopRequested || stopping ? "Stopping" : "Running"}</FooterState>
          {!done ? (
            <Button type="button" variant="outline" disabled={run.stopRequested || stopping} onClick={() => setStopAsked(true)}>
              {run.stopRequested || stopping ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
              Stop
            </Button>
          ) : null}
          <ConfirmDialog
            open={stopAsked}
            onOpenChange={setStopAsked}
            title="Stop this backtest?"
            description="The coins it has not reached yet are left untested. What it has worked out so far stays."
            confirmLabel="Stop"
            onConfirm={() => {
              setStopAsked(false)
              askToStop()
            }}
          />
        </>
      }
    >
      <PanelCard storageId="backtest-result" icon={<ChartLineIcon />} title="Result">
        {statsPanel}
      </PanelCard>
      <TradesPopover
        open={tradesOpen && coinPicked !== undefined}
        onOpenChange={setTradesOpen}
        anchor={tradesCard}
        menu={
          <TradeColumnsMenu
            kind="backtest"
            hidden={panelLayouts.layouts.hiddenTradeColumns.backtest ?? []}
            onChange={(hidden) => panelLayouts.rememberHiddenTradeColumns("backtest", hidden)}
          />
        }
      >
        {(headerAction) => (
          <BacktestTradesPanel
            symbol={coinPicked?.symbol ?? null}
            summary={coinPicked?.summary ?? null}
            trades={popTrades}
            loading={popLoading}
            error={popError}
            selected={popIsChart ? selectedTrade : null}
            onRetry={popIsChart ? retryChart : () => setPopAttempt((count) => count + 1)}
            onSelect={selectFromPopover}
            headerAction={headerAction}
            hidden={panelLayouts.layouts.hiddenTradeColumns.backtest}
            listClassName={TRADES_POPOVER_LIST_MAX}
          />
        )}
      </TradesPopover>
      {skippedCard}
    </OpenRunPanel>
  )

  return frame({ header: null, middle, right: { label: "Backtest", content: right } })
}
