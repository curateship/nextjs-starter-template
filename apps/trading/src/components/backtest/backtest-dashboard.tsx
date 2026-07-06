import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import type { Layout } from "react-resizable-panels"

import {
  buildParams,
  paramsToValues,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import {
  PriceChartView,
  type ChartCandle,
} from "@/components/trading/price-chart"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  loadBacktest,
  loadBacktestCandles,
  loadChartCandles,
  runBacktest,
  type BacktestDetail,
  type BacktestListItem,
  type StrategyDefaultsMap,
} from "@/lib/api/backtests"
import {
  DEFAULT_BACKTEST_COSTS,
  type BacktestResult,
} from "@/lib/backtest/types"
import { useMarketRows } from "@/lib/hl/hooks"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import {
  DEFAULT_RISK_PARAMS,
  STRATEGY_LABELS,
  strategyParamsSchema,
} from "@/lib/strategies/params"
import type { HistoryCandle } from "@/server/backtest/history"
import { cn } from "@/lib/utils"

import { price as fmtPrice, windowDaysOf } from "./backtest-format"
import { BacktestHeader } from "./backtest-header"
import {
  buildRunMarkers,
  buildStrategyOverlays,
  type StrategyChartOverlays,
} from "./backtest-overlays"
import { BacktestSummary } from "./backtest-summary"
import { NewRunDialog } from "./new-run-dialog"
import type { RunDraft } from "./run-draft"
import { StrategyInputs } from "./strategy-inputs"
import { StrategyTester } from "./strategy-tester"

/** Chart line id → grid param it re-prices when dragged. */
const DRAG_PARAM_BY_LINE: Record<string, string> = {
  "grid-lower": "lowerPx",
  "grid-upper": "upperPx",
  "grid-tp": "takeProfitPx",
  "grid-sl": "stopLossPx",
}

const EMPTY_CANDLES: HistoryCandle[] = []
const EMPTY_OVERLAYS: StrategyChartOverlays = {
  indicators: [],
  overlayLines: [],
  priceLines: [],
}
const WINDOW_DEBOUNCE_MS = 500

type ChartRequest =
  | { kind: "run"; id: string; key: string }
  | {
      kind: "cfg"
      market: string
      interval: CandleInterval
      windowDays: number
      key: string
    }

export function BacktestDashboard({
  initialRuns,
  strategyDefaults,
  runId,
  draft = null,
  onRunIdChange,
  onNewDraft,
  onViewAll,
}: {
  initialRuns: BacktestListItem[]
  strategyDefaults?: StrategyDefaultsMap
  runId: string | null
  /** Configured-but-not-executed run being tuned before its first execution. */
  draft?: RunDraft | null
  onRunIdChange: (id: string | null) => void
  onNewDraft: (draft: RunDraft) => void
  onViewAll: () => void
}) {
  const markets = useMarketRows("mainnet")
  const router = useRouter()

  // Chart config — the source of truth for what the chart shows. The route
  // keys this component by run/draft, so mount-time seeding is enough.
  const [market, setMarket] = React.useState(draft?.market ?? "BTC")
  const [interval, setTimeframe] = React.useState<CandleInterval>(
    draft?.interval ?? "15m"
  )
  const [windowDays, setWindowDays] = React.useState(
    draft ? String(draft.windowDays) : "30"
  )
  const [equity, setEquity] = React.useState(
    draft ? String(draft.equity) : "10000"
  )
  const [taker, setTaker] = React.useState(
    String(draft?.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps)
  )
  const [maker, setMaker] = React.useState(
    String(draft?.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps)
  )
  const [slippage, setSlippage] = React.useState(
    String(draft?.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps)
  )
  /** Param values for the strategy being tuned (Run / Re-run surface). */
  const [params, setParams] = React.useState<ParamValues>(draft?.params ?? {})

  const [runState, setRunState] = React.useState<{
    id: string
    detail: BacktestDetail | null
  }>({ id: "", detail: null })
  const [chartState, setChartState] = React.useState<{
    key: string
    candles: HistoryCandle[]
    simStartMs: number
  }>({ key: "", candles: EMPTY_CANDLES, simStartMs: 0 })
  const [ohlc, setOhlc] = React.useState<ChartCandle | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = runId && runState.id === runId ? runState.detail : null
  const result: BacktestResult | null =
    run?.status === "done" ? (run.result ?? null) : null

  const windowNum = clampWindow(windowDays)
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
    return runMatchesConfig && run
      ? { kind: "run", id: run.id, key: `run:${run.id}` }
      : {
          kind: "cfg",
          market,
          interval,
          windowDays: debouncedWindow,
          key: `cfg:${market}:${interval}:${debouncedWindow}`,
        }
  }, [runId, runMatchesConfig, run, market, interval, debouncedWindow])

  // The chart always has data for the current request — on open, on every
  // market/timeframe/window change, and for a loaded run's own window.
  React.useEffect(() => {
    if (!chartReq) return
    let cancelled = false
    void (async () => {
      try {
        const data =
          chartReq.kind === "run"
            ? await loadBacktestCandles(chartReq.id)
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
    setParams(paramsToValues(detail.params))
  }, [])

  // Load the run behind ?run= (already finished — runs execute synchronously).
  React.useEffect(() => {
    if (!runId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await loadBacktest(runId)
        if (cancelled || !res.backtest) return
        setRunState({ id: runId, detail: res.backtest })
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

  function selectRun(id: string) {
    setError(null)
    onRunIdChange(id)
  }

  /** Runs the draft's first execution, or re-runs the loaded run's config. */
  async function execute() {
    const strategyType = run?.strategyType ?? draft?.strategy
    if (!strategyType) return
    setError(null)
    const parsed = strategyParamsSchema.safeParse(
      buildParams(strategyType, params)
    )
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) =>
            issue.path.length
              ? `${issue.path.join(".")}: ${issue.message}`
              : issue.message
          )
          .join(" · ")
      )
      return
    }
    const equityNum = Number(equity)
    const takerNum = Number(taker)
    const makerNum = Number(maker)
    const slipNum = Number(slippage)
    if (!(equityNum > 0)) return setError("Starting equity must be positive.")
    if (!(windowNum >= 1 && windowNum <= 90)) {
      return setError("Date range must be between 1 and 90 days.")
    }
    if (!(takerNum >= 0 && takerNum <= 50) || !(makerNum >= 0 && makerNum <= 50)) {
      return setError("Fees must be between 0 and 50 bps.")
    }
    if (!(slipNum >= 0 && slipNum <= 100)) {
      return setError("Slippage must be between 0 and 100 bps.")
    }

    setBusy(true)
    try {
      const res = await runBacktest({
        name: run ? undefined : draft?.name,
        rerunOf: run?.id,
        market,
        interval,
        windowDays: windowNum,
        startingEquity: equityNum,
        takerFeeBps: takerNum,
        makerFeeBps: makerNum,
        slippageBps: slipNum,
        params: parsed.data,
        riskParams: run?.riskParams ?? DEFAULT_RISK_PARAMS,
      })
      onRunIdChange(res.backtestId)
      // Refresh the route loader so Recent and the drill-down tables see the
      // new execution (search-only navigation doesn't re-run loaders).
      void router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed")
    } finally {
      setBusy(false)
    }
  }

  const strategyType = run?.strategyType ?? draft?.strategy ?? null

  // Overlays preview live from the rail's params; markers come from the run.
  const overlays = React.useMemo(() => {
    if (!strategyType || candles.length === 0) return EMPTY_OVERLAYS
    const parsed = strategyParamsSchema.safeParse(
      buildParams(strategyType, params)
    )
    const overlayParams = parsed.success ? parsed.data : (run?.params ?? null)
    if (!overlayParams) return EMPTY_OVERLAYS
    return buildStrategyOverlays(
      overlayParams,
      candles,
      runMatchesConfig ? result : null
    )
  }, [strategyType, run, params, candles, runMatchesConfig, result])

  /** Dragging a grid bound / SL / TP line re-prices its parameter. */
  function handleLineDrag(lineId: string, price: number) {
    const key = DRAG_PARAM_BY_LINE[lineId]
    if (!key || !(price > 0)) return
    setParams((current) => ({
      ...current,
      [key]: String(Number(price.toPrecision(6))),
    }))
  }

  const markers = React.useMemo(
    () => (runMatchesConfig && result ? buildRunMarkers(result) : []),
    [runMatchesConfig, result]
  )

  const mid = Number(markets.find((row) => row.coin === market)?.markPx ?? 0)
  const selectedRow = markets.find((row) => row.coin === market)
  const dayChangePct =
    selectedRow && Number(selectedRow.prevDayPx) > 0
      ? (Number(selectedRow.markPx) / Number(selectedRow.prevDayPx) - 1) * 100
      : null

  // Mark price for open-position P&L: only meaningful on the run's own data.
  const markPrice =
    runMatchesConfig && candles.length ? candles[candles.length - 1].c : 0

  const staleHint =
    run && result && !runMatchesConfig
      ? `Results from ${run.market} · ${run.interval} · ${windowDaysOf(run)}d — Re-run to update`
      : null

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
        markPrice={mid}
        dayChangePct={dayChangePct}
        runName={run?.name ?? draft?.name ?? (draft ? "New run" : null)}
        strategyLabel={strategyType ? STRATEGY_LABELS[strategyType] : null}
        isDraft={!run && Boolean(draft)}
        dateRangeText={describeWindow(windowNum)}
        staleHint={staleHint}
        runs={initialRuns}
        onSelectRun={selectRun}
        onViewAll={onViewAll}
        onNewRun={() => setDialogOpen(true)}
        onRun={() => void execute()}
        runAction={run ? "rerun" : draft ? "run" : null}
        running={busy}
      />
      {error || run?.status === "error" ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          {error ?? run?.error}
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
            <ResizablePanel id="inputs" defaultSize="20%" minSize="13%">
              <StrategyInputs
                strategy={strategyType}
                values={params}
                disabled={busy}
                mid={mid}
                windowDays={windowDays}
                equity={equity}
                onChange={(key, value) => {
                  setParams((current) => ({ ...current, [key]: value }))
                  if (key === "interval") {
                    setTimeframe(value as CandleInterval)
                  }
                }}
                onWindowChange={setWindowDays}
                onEquityChange={setEquity}
                costs={{ taker, maker, slippage }}
                onCostsChange={(key, value) => {
                  if (key === "taker") setTaker(value)
                  else if (key === "maker") setMaker(value)
                  else setSlippage(value)
                }}
                onReset={() => {
                  if (run) hydrate(run)
                  else if (draft) setParams(draft.params)
                }}
                onNewRun={() => setDialogOpen(true)}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="chart" defaultSize="60%" minSize="30%">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center gap-3 border-b px-3 py-1.5">
                  <div className="flex gap-0.5">
                    {CANDLE_INTERVALS.map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => {
                          setTimeframe(tf)
                          if (strategyType === "momentum") {
                            setParams((current) => ({ ...current, interval: tf }))
                          }
                        }}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground",
                          interval === tf && "bg-muted text-foreground"
                        )}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  {overlays.overlayLines.length > 0 ? (
                    <>
                      <div className="h-4 w-px bg-border" />
                      {overlays.overlayLines.map((line) => (
                        <span key={line.id} className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-0.5 w-3.5 rounded"
                            style={{ background: line.color }}
                          />
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {line.label}
                          </span>
                        </span>
                      ))}
                    </>
                  ) : null}
                  <div className="flex-1" />
                  {readout ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      O {fmtPrice(Number(readout.o))} · H {fmtPrice(Number(readout.h))} ·
                      L {fmtPrice(Number(readout.l))} · C {fmtPrice(Number(readout.c))}
                    </span>
                  ) : null}
                </div>
                <div className="relative min-h-0 flex-1">
                  <PriceChartView
                    candles={candles}
                    loading={chartLoading}
                    coin={market}
                    dataKey={chartReq?.key ?? "pending"}
                    indicators={overlays.indicators}
                    overlayLines={overlays.overlayLines}
                    priceLines={overlays.priceLines}
                    markers={markers}
                    visibleStartMs={chartState.simStartMs || undefined}
                    onCrosshairOhlc={setOhlc}
                    onLineDragEnd={handleLineDrag}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
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
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="tester" defaultSize="32%" minSize="15%">
          <StrategyTester
            result={result}
            startingEquity={Number(equity) || 0}
            markPrice={markPrice}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <NewRunDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        markets={markets}
        defaultMarket={market}
        defaultInterval={interval}
        userDefaults={strategyDefaults}
        onContinue={onNewDraft}
      />
    </div>
  )
}

/** Clamp the free-text window input to something fetchable. */
function clampWindow(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 30
  return Math.min(90, Math.round(parsed))
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

/** Persist a resizable layout in localStorage (same as /trade, bot-detail). */
function usePersistedLayout(key: string) {
  const [defaultLayout] = React.useState<Layout | undefined>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as Layout) : undefined
    } catch {
      return undefined
    }
  })

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // storage full/blocked — layout just won't persist
      }
    },
    [key]
  )

  return { defaultLayout, onLayoutChanged }
}
