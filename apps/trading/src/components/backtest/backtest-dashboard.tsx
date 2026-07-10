import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import {
  PriceChartView,
  type ChartCandle,
  type ChartFocusPoint,
  type ChartFocusResult,
} from "@/components/chart/price-chart"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  loadBacktest,
  loadBacktestCandles,
  loadChartCandles,
  type BacktestDetail,
  type BacktestGroupRun,
  type BacktestListItem,
} from "@/lib/api/backtests"
import {
  DEFAULT_BACKTEST_COSTS,
  INTERVAL_MS,
  MAX_BACKTEST_BARS,
  maxWindowDays,
  type BacktestResult,
  type BacktestTrade,
} from "@/lib/backtest/types"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { usePersistedLayout } from "@/lib/use-persisted-layout"
import { indicatorOverlays } from "@/components/chart/indicator-overlays"
import { INDICATORS } from "@/lib/indicators/registry"
import type { HistoryCandle } from "@/server/backtest/history"

import {
  formatFocusDays,
  pct,
  signedUsd,
  windowDaysOf,
} from "./backtest-format"
import { ChartToolbar } from "@/components/chart/chart-toolbar"
import { BacktestHeader } from "./backtest-header"
import {
  buildRunMarkers,
  type StrategyChartOverlays,
} from "./backtest-overlays"
import { BacktestSummary } from "./backtest-summary"
import { NewRunDialog } from "./new-run-dialog"
import { StrategyInputs } from "./strategy-inputs"
import { StrategyTester } from "./strategy-tester"

const EMPTY_CANDLES: HistoryCandle[] = []
const EMPTY_OVERLAYS: StrategyChartOverlays = {
  indicators: [],
  overlayLines: [],
  priceLines: [],
  zones: [],
  barColors: [],
  markers: [],
}
const WINDOW_DEBOUNCE_MS = 500

// Progressive candle loading for a loaded run: open on a small recent window,
// extend to a month in the background, then back-fill older history on demand.
const DAY_MS = 86_400_000
const INITIAL_DAYS = 10
const BACKGROUND_DAYS = 30
const CHUNK_DAYS = 30
/** Start loading older history when the view's left edge is within this of the loaded floor. */
const EDGE_BUFFER_MS = 2 * DAY_MS

/** Merge two candle sets, de-duped by open time and sorted ascending. */
function mergeCandles(
  a: HistoryCandle[],
  b: HistoryCandle[]
): HistoryCandle[] {
  const byTime = new Map<number, HistoryCandle>()
  for (const candle of a) byTime.set(candle.t, candle)
  for (const candle of b) byTime.set(candle.t, candle)
  return [...byTime.values()].sort((x, y) => x.t - y.t)
}

type ChartRequest =
  | {
      kind: "run"
      id: string
      interval: CandleInterval
      key: string
      runStartMs: number
      runEndMs: number
    }
  | {
      kind: "cfg"
      market: string
      interval: CandleInterval
      windowDays: number
      key: string
    }

export function BacktestDashboard({
  initialRuns,
  runId,
  onRunIdChange,
  onViewAll,
}: {
  initialRuns: BacktestListItem[]
  runId: string | null
  onRunIdChange: (id: string | null) => void
  onViewAll: () => void
}) {
  const markets = useBinanceMarketRows()
  const router = useRouter()

  // Chart config — the source of truth for what the chart shows. The route
  // keys this component by run, so mount-time seeding is enough.
  const [market, setMarket] = React.useState("BTC")
  const [interval, setTimeframe] = React.useState<CandleInterval>("15m")
  const [windowDays, setWindowDays] = React.useState("30")
  const [equity, setEquity] = React.useState("10000")
  const [taker, setTaker] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.takerFeeBps)
  )
  const [maker, setMaker] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.makerFeeBps)
  )
  const [slippage, setSlippage] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.slippageBps)
  )
  const [runState, setRunState] = React.useState<{
    id: string
    detail: BacktestDetail | null
    groupRuns: BacktestGroupRun[]
  }>({ id: "", detail: null, groupRuns: [] })
  const [chartState, setChartState] = React.useState<{
    key: string
    candles: HistoryCandle[]
    simStartMs: number
  }>({ key: "", candles: EMPTY_CANDLES, simStartMs: 0 })
  const [ohlc, setOhlc] = React.useState<ChartCandle | null>(null)
  /** Trade clicked in the List of Trades — the chart zooms to its window. */
  const [focusedTrade, setFocusedTrade] = React.useState<BacktestTrade | null>(
    null
  )
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [inputsOpen, setInputsOpen] = React.useState(true)
  const [summaryOpen, setSummaryOpen] = React.useState(true)

  const run = runId && runState.id === runId ? runState.detail : null
  const groupRuns = runId && runState.id === runId ? runState.groupRuns : []
  const result: BacktestResult | null =
    run?.status === "done" ? (run.result ?? null) : null
  // A loaded run is immutable — its config rail is read-only. Editing only
  // happens in draft mode, before the first (and only) execution.
  const readOnly = Boolean(run)

  // A different result invalidates the selection (trade numbers restart at 1).
  React.useEffect(() => setFocusedTrade(null), [result])

  // Pulsing rings on the focused trade's entry and exit arrows, so it stands
  // out from all the other fill arrows on the chart. Sides match the arrows:
  // a long enters with a buy and exits with a sell (shorts are reversed).
  const focusPoints = React.useMemo<ChartFocusPoint[]>(() => {
    if (!focusedTrade) return []
    const long = focusedTrade.side === "long"
    return [
      {
        time: focusedTrade.entryTime,
        side: long ? "buy" : "sell",
        label: "Entry",
        price: focusedTrade.entryPx,
      },
      {
        time: focusedTrade.exitTime,
        side: long ? "sell" : "buy",
        label: "Exit",
        price: focusedTrade.exitPx,
      },
    ]
  }, [focusedTrade])

  // Result box spanning the focused trade's entry → exit: return %, net P&L,
  // and how long the trip lasted. Bars are counted at the run's own timeframe.
  const focusResult = React.useMemo<ChartFocusResult | null>(() => {
    if (!focusedTrade) return null
    const spanMs = focusedTrade.exitTime - focusedTrade.entryTime
    const barMs = INTERVAL_MS[(run?.interval as CandleInterval) ?? interval]
    const days = spanMs / 86_400_000
    return {
      up: focusedTrade.pnl >= 0,
      pctText: pct(focusedTrade.returnPct),
      pnlText: signedUsd(focusedTrade.pnl),
      bars: Math.max(1, Math.round(spanMs / barMs)),
      daysText: formatFocusDays(days),
    }
  }, [focusedTrade, run, interval])

  const windowNum = clampWindow(windowDays, interval, MAX_BACKTEST_BARS)
  const debouncedWindow = useDebouncedValue(windowNum, WINDOW_DEBOUNCE_MS)

  // Run mode only while the loaded run still matches the chart config. The
  // window compares undebounced so hydration lands directly in run mode.
  const runMatchesConfig = Boolean(
    run &&
      run.status === "done" &&
      run.market === market &&
      run.interval === interval &&
      windowDaysOf(run) === windowNum
  )

  // null while the ?run= row is still loading — fetching config-mode candles
  // for the pre-hydration defaults would hit the wrong market entirely.
  const chartReq = React.useMemo<ChartRequest | null>(() => {
    if (runId && !run) return null
    // A loaded run always shows its own window — even at a finer display
    // timeframe — so every trade sits over real candles instead of running off
    // the edge of a now-anchored, bar-capped browse window.
    if (run && run.status === "done") {
      return {
        kind: "run",
        id: run.id,
        interval,
        key: `run:${run.id}:${interval}`,
        runStartMs: Date.parse(run.startTime),
        runEndMs: Date.parse(run.endTime),
      }
    }
    return {
      kind: "cfg",
      market,
      interval,
      windowDays: debouncedWindow,
      key: `cfg:${market}:${interval}:${debouncedWindow}`,
    }
  }, [runId, run, market, interval, debouncedWindow])

  // Initial load: a config-browse window in one shot, or a loaded run's recent
  // slice (the rest streams in via the background + on-demand effects below).
  React.useEffect(() => {
    if (!chartReq) return
    let cancelled = false
    void (async () => {
      try {
        const data =
          chartReq.kind === "run"
            ? await loadBacktestCandles(chartReq.id, chartReq.interval, {
                fromMs: Math.max(
                  chartReq.runStartMs,
                  chartReq.runEndMs - INITIAL_DAYS * DAY_MS
                ),
                toMs: chartReq.runEndMs,
              })
            : await loadChartCandles({
                market: chartReq.market,
                interval: chartReq.interval,
                windowDays: chartReq.windowDays,
              })
        if (!cancelled) {
          setChartState({
            key: chartReq.key,
            candles: data.candles,
            simStartMs: data.simStartMs,
          })
        }
      } catch {
        // Transient fetch failure — keep the previous chart.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chartReq])

  // Background: once the initial slice is in, extend a loaded run back to a
  // month of history so a little scrolling needs no fetch. Runs once per run.
  React.useEffect(() => {
    if (!chartReq || chartReq.kind !== "run") return
    if (chartState.key !== chartReq.key) return
    const floor = chartState.candles[0]?.t
    if (floor === undefined) return
    const target = Math.max(
      chartReq.runStartMs,
      chartReq.runEndMs - BACKGROUND_DAYS * DAY_MS
    )
    if (target >= floor) return // already covered (e.g. by the warmup runway)
    let cancelled = false
    void (async () => {
      try {
        const data = await loadBacktestCandles(chartReq.id, chartReq.interval, {
          fromMs: target,
          toMs: floor,
        })
        if (!cancelled) {
          setChartState((s) =>
            s.key === chartReq.key
              ? { ...s, candles: mergeCandles(data.candles, s.candles) }
              : s
          )
        }
      } catch {
        // ignore — on-demand loading still covers older history
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chartReq, chartState.key])

  // Load older history back to `targetFromMs` (the server adds warmup behind it)
  // and merge it in. Shared by scroll-back loading and far-back trade focus.
  const loadOlderTo = React.useCallback(
    async (targetFromMs: number): Promise<void> => {
      if (!chartReq || chartReq.kind !== "run") return
      const floor = chartState.candles[0]?.t
      if (floor === undefined || targetFromMs >= floor) return
      try {
        const data = await loadBacktestCandles(chartReq.id, chartReq.interval, {
          fromMs: targetFromMs,
          toMs: floor,
        })
        setChartState((s) =>
          s.key === chartReq.key
            ? { ...s, candles: mergeCandles(data.candles, s.candles) }
            : s
        )
      } catch {
        // ignore — a later scroll or click retries
      }
    },
    [chartReq, chartState.candles]
  )

  // On-demand: load an older chunk when the user scrolls near the loaded floor.
  const loadingOlderRef = React.useRef(false)
  const handleVisibleRange = React.useCallback(
    (fromSec: number) => {
      if (!chartReq || chartReq.kind !== "run") return
      const floor = chartState.candles[0]?.t
      if (floor === undefined || floor <= chartReq.runStartMs) return
      if (fromSec * 1000 > floor + EDGE_BUFFER_MS) return
      if (loadingOlderRef.current) return
      loadingOlderRef.current = true
      const target = Math.max(chartReq.runStartMs, floor - CHUNK_DAYS * DAY_MS)
      void loadOlderTo(target).finally(() => {
        loadingOlderRef.current = false
      })
    },
    [chartReq, chartState.candles, loadOlderTo]
  )

  // Clicking a trade from the list: if it's older than what's loaded, pull its
  // history in first, then focus — otherwise the chart jumps to a time with only
  // a couple of stray candles loaded.
  const handleSelectTrade = React.useCallback(
    (trade: BacktestTrade | null) => {
      if (trade && chartReq?.kind === "run") {
        const floor = chartState.candles[0]?.t
        if (floor !== undefined && trade.entryTime < floor) {
          void loadOlderTo(
            Math.max(chartReq.runStartMs, trade.entryTime)
          ).finally(() => setFocusedTrade(trade))
          return
        }
      }
      setFocusedTrade(trade)
    },
    [chartReq, chartState.candles, loadOlderTo]
  )

  const candles =
    chartReq && chartState.key === chartReq.key
      ? chartState.candles
      : EMPTY_CANDLES
  const chartLoading = !chartReq || chartState.key !== chartReq.key

  const hydrate = React.useCallback((detail: BacktestDetail) => {
    setMarket(detail.market)
    setTimeframe(detail.interval as CandleInterval)
    setWindowDays(String(windowDaysOf(detail)))
    setEquity(String(detail.startingEquity))
    setTaker(String(detail.costs.takerFeeBps))
    setMaker(String(detail.costs.makerFeeBps))
    setSlippage(String(detail.costs.slippageBps))
  }, [])

  // Load the run behind ?run= (it may still be queued/running in the
  // background — the poll effect below refreshes it until it finishes).
  React.useEffect(() => {
    if (!runId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await loadBacktest(runId)
        if (cancelled || !res.backtest) return
        setRunState({
          id: runId,
          detail: res.backtest,
          groupRuns: res.groupRuns,
        })
        // Sync the config rail to the run. Runs once per mount — the route
        // keys this component by run id, so a run change remounts it.
        hydrate(res.backtest)
      } catch {
        // ignore; the workspace still browses candles without the run
      }
    })()
    return () => {
      cancelled = true
    }
  }, [runId, hydrate])

  // While the selected run is still queued/running, poll for its result and
  // refresh — without re-hydrating the config rail (that would clobber edits).
  React.useEffect(() => {
    if (!runId) return
    if (run?.status !== "pending" && run?.status !== "running") return
    let cancelled = false
    const timer = setInterval(() => {
      void (async () => {
        try {
          const res = await loadBacktest(runId)
          if (cancelled || !res.backtest) return
          setRunState({
            id: runId,
            detail: res.backtest,
            groupRuns: res.groupRuns,
          })
        } catch {
          // ignore transient errors; keep polling
        }
      })()
    }, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [runId, run?.status])

  function selectRun(id: string) {
    setError(null)
    onRunIdChange(id)
  }

  const signalRun = run?.params ?? null

  // Overlays paint straight from the run's indicator config — the same
  // compute the engine traded.
  const overlays = React.useMemo(() => {
    if (candles.length === 0 || !signalRun) return EMPTY_OVERLAYS
    return indicatorOverlays(signalRun.indicator, candles)
  }, [signalRun, candles])

  // Legend chips only for named lines (channels, bands). Unlabeled marks like
  // the 100s of swing pivots would otherwise flood the toolbar with dashes.
  const labeledOverlayLines = overlays.overlayLines.filter((line) => line.label)

  // Open/close chips for the run's real fills. They need only fill times and
  // prices, so they stay correct at any display timeframe.
  const markers = React.useMemo(
    () => (result ? buildRunMarkers(result) : []),
    [result]
  )

  // Read-only rows for the Inputs rail: what the run executed with.
  const inputRows = React.useMemo(() => {
    if (!run) return []
    const rows: { label: string; value: string }[] = [
      { label: "Date range", value: `${windowDaysOf(run)}d back` },
      { label: "Timeframe", value: run.interval },
      { label: "Starting equity", value: `$${run.startingEquity}` },
      { label: "Taker fee", value: `${run.costs.takerFeeBps} bps` },
      { label: "Maker fee", value: `${run.costs.makerFeeBps} bps` },
      { label: "Slippage", value: `${run.costs.slippageBps} bps` },
    ]
    if (signalRun) {
      const module = INDICATORS[signalRun.indicator.type]
      rows.push({ label: "Indicator", value: module?.label ?? signalRun.indicator.type })
      for (const field of module?.paramFields ?? []) {
        const value = signalRun.indicator.params[field.key]
        if (value !== undefined) rows.push({ label: field.label, value: String(value) })
      }
      const st = signalRun.settings
      rows.push(
        { label: "Direction", value: st.direction },
        {
          label: "Order size",
          value: st.compounding ? "compounding" : `$${st.orderSizeUsd}`,
        },
        { label: "Take profit", value: st.takeProfitPct ? `${st.takeProfitPct}%` : "off" },
        { label: "Stop loss", value: st.stopLossPct ? `${st.stopLossPct}%` : "off" },
        { label: "Flip on opposite", value: st.flipOnOppositeSignal ? "on" : "off" }
      )
    }
    return rows
  }, [run, signalRun])

  const mid = Number(markets.find((row) => row.coin === market)?.markPx ?? 0)
  const selectedRow = markets.find((row) => row.coin === market)
  const dayChangePct =
    selectedRow && Number(selectedRow.prevDayPx) > 0
      ? (Number(selectedRow.markPx) / Number(selectedRow.prevDayPx) - 1) * 100
      : null

  // Mark price for open-position P&L: only meaningful on the run's own data.
  const markPrice =
    runMatchesConfig && candles.length ? candles[candles.length - 1].c : 0

  const lastCandle = candles.length ? candles[candles.length - 1] : null
  const readout = ohlc ?? lastCandle

  const outerLayout = usePersistedLayout("backtest-layout-vertical")
  const innerLayout = usePersistedLayout("backtest-layout-horizontal")

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col">
      <BacktestHeader
        market={market}
        markets={markets}
        onMarketChange={setMarket}
        marketReadOnly={readOnly}
        groupRuns={groupRuns}
        currentRunId={run?.id ?? null}
        markPrice={mid}
        dayChangePct={dayChangePct}
        runName={run?.name ?? null}
        strategyLabel={
          signalRun
            ? (INDICATORS[signalRun.indicator.type]?.label ?? "Strategy")
            : null
        }
        dateRangeText={describeWindow(windowNum)}
        runs={initialRuns}
        onSelectRun={selectRun}
        onViewAll={onViewAll}
        onNewRun={() => setDialogOpen(true)}
        inputsOpen={inputsOpen}
        onToggleInputs={() => setInputsOpen((open) => !open)}
        summaryOpen={summaryOpen}
        onToggleSummary={() => setSummaryOpen((open) => !open)}
        onBack={() => {
          if (run) {
            void router.navigate({
              to: "/backtest/$strategyType/$groupId",
              params: {
                strategyType: run.params.indicator.type,
                groupId: run.groupId,
              },
            })
          } else {
            onViewAll()
          }
        }}
      />
      {error || run?.status === "error" ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          {error ?? run?.error}
        </div>
      ) : run?.status === "pending" || run?.status === "running" ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          {run.status === "running"
            ? "Running this market in the background — results will appear here when it finishes."
            : "Queued — this market will run in the background. Results will appear here shortly."}
        </div>
      ) : null}

      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 flex-1"
        defaultLayout={outerLayout.defaultLayout}
        onLayoutChanged={outerLayout.onLayoutChanged}
      >
        <ResizablePanel id="main" defaultSize="68%" minSize="35%">
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={innerLayout.defaultLayout}
            onLayoutChanged={innerLayout.onLayoutChanged}
          >
            {inputsOpen ? (
            <ResizablePanel id="inputs" defaultSize="20%" minSize="13%">
              <StrategyInputs
                title={
                  signalRun
                    ? (INDICATORS[signalRun.indicator.type]?.label ??
                      "Strategy")
                    : null
                }
                rows={inputRows}
                onNewRun={() => setDialogOpen(true)}
              />
            </ResizablePanel>
            ) : null}
            {inputsOpen ? <ResizableHandle withHandle /> : null}
            <ResizablePanel id="chart" defaultSize="60%" minSize="30%">
              <div className="flex h-full min-h-0 flex-col">
                <ChartToolbar
                  intervals={CANDLE_INTERVALS}
                  interval={interval}
                  // A saved run is immutable — this only changes the
                  // chart's display timeframe, to inspect candles.
                  onIntervalChange={setTimeframe}
                  legend={{
                    chips: Boolean(result),
                    signals: !result && Boolean(signalRun),
                  }}
                  legendLines={labeledOverlayLines}
                  ohlc={readout}
                />
                <div className="relative min-h-0 flex-1">
                  <PriceChartView
                    candles={candles}
                    loading={chartLoading}
                    coin={market}
                    dataKey={chartReq?.key ?? "pending"}
                    indicators={overlays.indicators}
                    overlayLines={overlays.overlayLines}
                    priceLines={overlays.priceLines}
                    zones={overlays.zones}
                    barColors={overlays.barColors}
                    markers={markers}
                    visibleStartMs={chartState.simStartMs || undefined}
                    focusPoints={focusPoints}
                    focusResult={focusResult}
                    onCrosshairOhlc={setOhlc}
                    onVisibleRangeChange={handleVisibleRange}
                  />
                </div>
              </div>
            </ResizablePanel>
            {summaryOpen ? <ResizableHandle withHandle /> : null}
            {summaryOpen ? (
            <ResizablePanel id="summary" defaultSize="20%" minSize="13%">
              <BacktestSummary
                result={result}
                markPrice={markPrice}
                config={{
                  market,
                  interval,
                  windowDays: windowNum,
                  startingEquity: Number(equity) || 0,
                  costsText: `taker ${taker}bp · maker ${maker}bp · slip ${slippage}bp`,
                  network: "mainnet",
                  ranAt: run?.completedAt
                    ? new Date(run.completedAt).toLocaleString("en-US", {
                        hour12: false,
                      })
                    : null,
                }}
              />
            </ResizablePanel>
            ) : null}
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="tester" defaultSize="32%" minSize="15%">
          <StrategyTester
            result={result}
            startingEquity={Number(equity) || 0}
            markPrice={markPrice}
            selectedTradeN={focusedTrade?.n ?? null}
            onSelectTrade={handleSelectTrade}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <NewRunDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        markets={markets}
        defaultMarket={market}
        onLaunched={(backtestId) => onRunIdChange(backtestId)}
      />
    </div>
  )
}

/** Clamp the free-text window input to what the interval + bar ceiling allow. */
function clampWindow(
  value: string,
  interval: CandleInterval,
  maxBars: number
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 30
  return Math.min(maxWindowDays(interval, maxBars), Math.round(parsed))
}

/** "Jun 6 – Jul 6 · 30d" for the header date range. */
function describeWindow(days: number): string {
  if (!(days > 0)) return ""
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${fmt(start)} – ${fmt(end)} · ${days}d`
}

/** Trailing-edge debounce for free-text inputs. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
