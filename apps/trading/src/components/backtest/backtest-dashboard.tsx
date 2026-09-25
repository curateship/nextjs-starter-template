import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import {
  PriceChartView,
  type ChartCandle,
} from "@/components/chart/price-chart"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  loadBacktest,
  loadChartCandles,
  type BacktestDetail,
  type BacktestGroupRun,
  type BacktestListItem,
} from "@/lib/api/backtests"
import {
  MAX_BACKTEST_BARS,
  maxWindowDays,
  type BacktestResult,
  type BacktestTrade,
} from "@/lib/backtest/types"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { usePersistedLayout } from "@/lib/use-persisted-layout"
import {
  automationInputRows,
  automationTypeLabel,
  automationTypeOf,
} from "@/lib/strategies/strategy-config"
import { isManualRunParams } from "@/lib/backtest/manual-types"
import type { HistoryCandle } from "@/server/backtest/history"

import { windowDaysOf } from "@/lib/format"
import { ChartToolbar } from "@/components/chart/chart-toolbar"
import { BacktestHeader } from "./backtest-header"
import { BacktestRunChart } from "./backtest-run-chart"
import { BacktestSummary } from "./backtest-summary"
import { StrategyInputs } from "./strategy-inputs"
import { StrategyTester } from "./strategy-tester"

const EMPTY_CANDLES: HistoryCandle[] = []
const WINDOW_DEBOUNCE_MS = 500

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

  // Chart config — the source of truth for config-browse mode. The route
  // keys this component by run, so mount-time seeding is enough.
  const [market, setMarket] = React.useState("BTC")
  const [interval, setTimeframe] = React.useState<CandleInterval>("15m")
  const [windowDays, setWindowDays] = React.useState("30")
  const [equity, setEquity] = React.useState("10000")
  const [runState, setRunState] = React.useState<{
    id: string
    detail: BacktestDetail | null
    groupRuns: BacktestGroupRun[]
  }>({ id: "", detail: null, groupRuns: [] })
  /** Config-browse candles (no finished run loaded). */
  const [cfgChart, setCfgChart] = React.useState<{
    key: string
    candles: HistoryCandle[]
    simStartMs: number
  }>({ key: "", candles: EMPTY_CANDLES, simStartMs: 0 })
  const [ohlc, setOhlc] = React.useState<ChartCandle | null>(null)
  /** Trade clicked in the List of Trades — the chart zooms to its window. */
  const [focusedTrade, setFocusedTrade] = React.useState<BacktestTrade | null>(
    null
  )
  /** Last close the run chart shows — mark price for open-position rows. */
  const [runLastClose, setRunLastClose] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [inputsOpen, setInputsOpen] = React.useState(true)
  const [summaryOpen, setSummaryOpen] = React.useState(true)

  const run = runId && runState.id === runId ? runState.detail : null
  const groupRuns = runId && runState.id === runId ? runState.groupRuns : []
  const result: BacktestResult | null =
    run?.status === "done" ? (run.result ?? null) : null
  // A loaded run is immutable — its config rail is read-only.
  const readOnly = Boolean(run)
  const runMode = Boolean(run && run.status === "done" && result)

  // A different result invalidates the selection (trade numbers restart at 1).
  React.useEffect(() => setFocusedTrade(null), [result])

  const windowNum = clampWindow(windowDays, interval, MAX_BACKTEST_BARS)
  const debouncedWindow = useDebouncedValue(windowNum, WINDOW_DEBOUNCE_MS)

  // Config-browse candles: only when no finished run is loaded (the run chart
  // loads its own), and not while the ?run= row itself is still loading —
  // fetching for the pre-hydration defaults would hit the wrong market.
  const cfgKey =
    runMode || (runId && !run)
      ? null
      : `cfg:${market}:${interval}:${debouncedWindow}`
  React.useEffect(() => {
    if (!cfgKey) return
    let cancelled = false
    void (async () => {
      try {
        const data = await loadChartCandles({
          market,
          interval,
          windowDays: debouncedWindow,
        })
        if (!cancelled) {
          setCfgChart({
            key: cfgKey,
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
  }, [cfgKey, market, interval, debouncedWindow])

  const cfgCandles =
    cfgKey && cfgChart.key === cfgKey ? cfgChart.candles : EMPTY_CANDLES
  const cfgLoading = Boolean(cfgKey) && cfgChart.key !== cfgKey

  const hydrate = React.useCallback((detail: BacktestDetail) => {
    setMarket(detail.market)
    setTimeframe(detail.interval as CandleInterval)
    setWindowDays(String(windowDaysOf(detail)))
    setEquity(String(detail.startingEquity))
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
    const poll = () => {
      if (document.visibilityState !== "visible") return
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
    }
    const timer = setInterval(poll, 3000)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [runId, run?.status])

  function selectRun(id: string) {
    setError(null)
    onRunIdChange(id)
  }

  const runConfig = run?.params ?? null
  // Manual practice sessions carry their own params shape — every
  // automation-only helper below is guarded off them.
  const manualConfig =
    runConfig && isManualRunParams(runConfig) ? runConfig : null
  const automationConfig =
    runConfig && !isManualRunParams(runConfig) ? runConfig : null
  const strategyLabel = manualConfig
    ? "Manual"
    : automationConfig
      ? automationTypeLabel(automationTypeOf(automationConfig))
      : null

  // Read-only rows for the Inputs rail: what the run executed with. The one
  // home for the run's config — the summary rail shows results only.
  const inputRows = React.useMemo(() => {
    if (!run) return []
    const rows: { label: string; value: string }[] = [
      { label: "Date range", value: `${windowDaysOf(run)}d back` },
      { label: "Timeframe", value: run.interval },
      { label: "Starting equity", value: `$${run.startingEquity}` },
      { label: "Taker fee", value: `${run.costs.takerFeeBps} bps` },
      { label: "Maker fee", value: `${run.costs.makerFeeBps} bps` },
      { label: "Slippage", value: `${run.costs.slippageBps} bps` },
      { label: "Network", value: run.network },
    ]
    if (run.completedAt) {
      rows.push({
        label: "Ran at",
        value: new Date(run.completedAt).toLocaleString("en-US", {
          hour12: false,
        }),
      })
    }
    if (manualConfig) {
      rows.push({ label: "Risk per trade", value: `${manualConfig.riskPct}%` })
    }
    if (automationConfig) rows.push(...automationInputRows(automationConfig))
    return rows
  }, [run, manualConfig, automationConfig])

  // Mark price for open-position P&L: the run chart's last visible close.
  const markPrice = runMode ? (runLastClose ?? 0) : 0

  const cfgLast = cfgCandles.length ? cfgCandles[cfgCandles.length - 1] : null
  const cfgReadout = ohlc ?? cfgLast

  const outerLayout = usePersistedLayout("backtest-layout-vertical")
  const innerLayout = usePersistedLayout("backtest-layout-horizontal")

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/60 dark:bg-background">
      <BacktestHeader
        market={market}
        markets={markets}
        onMarketChange={setMarket}
        marketReadOnly={readOnly}
        groupRuns={groupRuns}
        currentRunId={run?.id ?? null}
        automationId={run?.automationId ?? null}
        runName={run?.name ?? null}
        strategyLabel={strategyLabel}
        dateRangeText={describeWindow(windowNum)}
        runs={initialRuns}
        onSelectRun={selectRun}
        onViewAll={onViewAll}
        inputsOpen={inputsOpen}
        onToggleInputs={() => setInputsOpen((open) => !open)}
        summaryOpen={summaryOpen}
        onToggleSummary={() => setSummaryOpen((open) => !open)}
        onBack={() => {
          if (run) {
            void router.navigate({
              to: "/backtest/$groupId",
              params: { groupId: run.groupId },
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
            ? `${run.progressStage ?? "Running"} — ${run.progress}% complete.`
            : "Queued — this market will run in the background. Results will appear here shortly."}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 p-[var(--shell-gutter,0.75rem)]">
        <ResizablePanelGroup
          orientation="vertical"
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
              <WorkspacePanel>
                <StrategyInputs title={strategyLabel} rows={inputRows} />
              </WorkspacePanel>
            </ResizablePanel>
            ) : null}
            {inputsOpen ? <ResizableHandle gap /> : null}
            <ResizablePanel id="chart" defaultSize="60%" minSize="30%">
              <WorkspacePanel className="flex flex-col">
                {runMode && run ? (
                  <BacktestRunChart
                    run={run}
                    focusedTrade={focusedTrade}
                    onLastCloseChange={setRunLastClose}
                  />
                ) : (
                  <>
                    <ChartToolbar
                      intervals={CANDLE_INTERVALS}
                      interval={interval}
                      onIntervalChange={setTimeframe}
                      ohlc={cfgReadout}
                    />
                    <div className="relative min-h-0 flex-1">
                      <PriceChartView
                        candles={cfgCandles}
                        loading={cfgLoading}
                        dataKey={cfgKey ?? "pending"}
                        visibleStartMs={cfgChart.simStartMs || undefined}
                        onCrosshairOhlc={setOhlc}
                      />
                    </div>
                  </>
                )}
              </WorkspacePanel>
            </ResizablePanel>
            {summaryOpen ? <ResizableHandle gap /> : null}
            {summaryOpen ? (
            <ResizablePanel id="summary" defaultSize="20%" minSize="13%">
              <WorkspacePanel>
                <BacktestSummary result={result} run={run} groupRuns={groupRuns} />
              </WorkspacePanel>
            </ResizablePanel>
            ) : null}
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle gap />
        <ResizablePanel id="tester" defaultSize="32%" minSize="15%">
          <WorkspacePanel>
            <StrategyTester
              result={result}
              startingEquity={Number(equity) || 0}
              markPrice={markPrice}
              selectedTradeN={focusedTrade?.n ?? null}
              onSelectTrade={setFocusedTrade}
            />
          </WorkspacePanel>
        </ResizablePanel>
        </ResizablePanelGroup>
      </div>
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
