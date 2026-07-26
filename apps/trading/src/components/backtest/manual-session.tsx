import * as React from "react"
import { useBlocker, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { formatPriceDisplay } from "@/components/trading/format"
import { ChartToolbar } from "@/components/chart/chart-toolbar"
import { computeIndicatorPaint } from "@/components/chart/indicator-paint"
import { IndicatorsMenu } from "@/components/chart/indicators-menu"
import {
  CHART_DOWN_COLOR,
  CHART_UP_COLOR,
} from "@/components/chart/chart-markers"
import { CHIP_COLORS } from "@/components/chart/trade-chips"
import {
  PriceChartView,
  type ChartMarker,
  type ChartPriceLine,
  type PriceChartHandle,
} from "@/components/chart/price-chart"
import {
  PracticeSetupDialog,
  type PracticeConfig,
} from "@/components/backtest/practice-setup-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WorkspacePanel } from "@/components/ui/resizable"
import {
  loadPracticeCandles,
  saveManualBacktest,
} from "@/lib/api/backtests"
import { loadIndicators, saveIndicator } from "@/lib/api/indicators"
import { ManualSession } from "@/lib/backtest/manual-sim"
import {
  aggregateCandles,
  countRevealed,
  REPLAY_KEEP_BARS,
  REPLAY_TRIM_STEP,
  trailingWindow,
  trimToRunway,
  type ReplaySpeed,
} from "@/lib/backtest/replay"
import {
  BACKTEST_INTERVALS,
  DEFAULT_BACKTEST_COSTS,
  INTERVAL_MS,
  type BacktestInterval,
  type BacktestResult,
} from "@/lib/backtest/types"
import type { CandleInterval } from "@/lib/hl/ws"
import type { ChartDrawings } from "@/lib/trading/chart-drawings"
import type { ChartPosition } from "@/lib/trading/chart-positions"
import { EMPTY_CHART_DRAWINGS } from "@/lib/trading/chart-drawings"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"
import { usePersistedState } from "@/lib/use-persisted-state"
import { cn } from "@/lib/utils"
import type { HistoryCandle } from "@/server/backtest/history"
import {
  ArrowLeftIcon,
  DollarSignIcon,
  Loader2Icon,
  PictureInPicture2Icon,
} from "lucide-react"

import {
  formatFocusDays,
  pct,
  signedUsd,
  toneClass,
  usd,
} from "./backtest-format"
import { BacktestKpis } from "./backtest-kpis"
import { PracticeMiniChart } from "./practice-mini-chart"
import { ReplayTransport } from "./replay-transport"

/**
 * Longest stretch of real time one playback frame may bank. The playhead moves
 * by however long the last frame actually took, so a heavy frame catches itself
 * up instead of quietly running slow — but a frame that took ages (the tab was
 * hidden, the laptop slept) must not blast through half the session at once.
 */
const MAX_FRAME_MS = 250
/**
 * Shortest gap between playback steps. Each step re-renders the session and
 * repaints the chart, so stepping on every animation frame spends most of the
 * budget redrawing rather than replaying. ~30 steps a second looks identical —
 * the playhead advances by real elapsed time either way, so the tape runs at
 * exactly the same speed, just in slightly larger moves.
 */
const MIN_STEP_MS = 32
/**
 * History loaded behind the session start so support/resistance context is
 * visible from the first candle (also the indicator warmup runway).
 */
const CONTEXT_BARS = 1500
const DAY_MS = 86_400_000
/**
 * Older-history chunk loaded when the user scrolls near the loaded floor, in
 * BARS — not days. A fixed number of days is a wildly different amount of work
 * depending on the timeframe: 30 days is 120 bars at 4h and 43,200 bars at 1m.
 * Measured in bars it costs the same everywhere, and a chart carrying 43,000
 * surplus bars through its per-frame work is what made a long session lag.
 */
const CHUNK_BARS = 2000
/**
 * Start loading older history when the view's left edge is within this many
 * bars of the loaded floor. Also in bars, and comfortably smaller than the
 * chunk above — otherwise every chunk lands still inside the trigger zone and
 * the chart backfills itself in a loop until it hits the ceiling.
 */
const EDGE_BUFFER_BARS = 300

const EMPTY_CANDLES: HistoryCandle[] = []
/** Loaded-history ceiling: no point holding more than can ever be shown. */
const DISPLAY_CANDLE_CAP = REPLAY_KEEP_BARS + REPLAY_TRIM_STEP
/** Candles the indicator paint pipeline reruns over on every revealed bar. */
const PAINT_CANDLE_CAP = 1200
/**
 * Empty bars kept ahead of the tape, so there is somewhere to plan. A box is
 * drawn forward from where it was clicked, so with the chart's usual sliver of
 * right-hand room a trade planned at the live price landed almost entirely
 * off-screen and read as a click that never registered.
 */
const PLAN_ROOM_BARS = 40

/** Amber for resting entries — the same hue the replay tape uses. */
const WAITING_ORDER_COLOR = "#f59e0b"

/** Merge two candle sets, de-duped by open time and sorted ascending. */
function mergeCandles(a: HistoryCandle[], b: HistoryCandle[]): HistoryCandle[] {
  const byTime = new Map<number, HistoryCandle>()
  for (const candle of a) byTime.set(candle.t, candle)
  for (const candle of b) byTime.set(candle.t, candle)
  return [...byTime.values()].sort((x, y) => x.t - y.t)
}

/**
 * The practice session screen. Config comes from the setup modal via the
 * route; this screen loads history (deep context behind the start for
 * support/resistance), runs the client engine, and saves on Done.
 */
export function ManualSessionScreen({ config }: { config: PracticeConfig }) {
  const navigate = useNavigate()
  // Bumped on Restart: a fresh engine over the same candles, clean screen.
  const [sessionNonce, setSessionNonce] = React.useState(0)
  const [state, setState] = React.useState<{
    phase: "loading" | "ready" | "error"
    error?: string
    simCandles: HistoryCandle[]
    simStartMs: number
    endMs: number
    engine: ManualSession | null
    contextCandles: HistoryCandle[]
  }>({
    phase: "loading",
    simCandles: EMPTY_CANDLES,
    simStartMs: 0,
    endMs: 0,
    engine: null,
    contextCandles: EMPTY_CANDLES,
  })

  React.useEffect(() => {
    let cancelled = false
    const stepMs = INTERVAL_MS[config.interval]
    const nowMs = Date.now()
    const simStartMs = nowMs - config.days * DAY_MS
    void loadPracticeCandles({
      market: config.market,
      interval: config.interval,
      fromMs: simStartMs - CONTEXT_BARS * stepMs,
      toMs: nowMs,
    })
      .then((data) => {
        if (cancelled) return
        const runwayFromMs = simStartMs - CONTEXT_BARS * stepMs
        const context = trimToRunway(data.candles, runwayFromMs)
        const simCandles = context.filter((c) => c.t >= simStartMs)
        if (simCandles.length < 2) {
          setState((s) => ({
            ...s,
            phase: "error",
            error: `No ${config.interval} history found for ${config.market} in that window. Try another market or timeframe.`,
          }))
          return
        }
        setState({
          phase: "ready",
          simCandles,
          simStartMs,
          endMs: simCandles[simCandles.length - 1].T,
          contextCandles: context,
          engine: new ManualSession({
            simStartMs,
            startingEquity: config.equity,
            riskPct: config.riskPct,
            costs: DEFAULT_BACKTEST_COSTS,
          }),
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            phase: "error",
            error: "Could not load history for that market. Try again.",
          }))
        }
      })
    return () => {
      cancelled = true
    }
    // Deliberately the config's VALUES, not the object. The route rebuilds
    // `config` on every render, and depending on its identity would reload the
    // history and hand the live screen a brand-new engine mid-session — one
    // that has never seen the boxes already on the chart, so nothing the user
    // had planned would ever fill again.
  }, [
    config.market,
    config.interval,
    config.days,
    config.equity,
    config.riskPct,
  ])

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/60 dark:bg-background">
      {state.phase === "loading" ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : state.phase === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate({ to: "/backtest" })}
          >
            Back to Backtest
          </Button>
        </div>
      ) : state.engine ? (
        <ActiveSession
          key={`${sessionNonce}:${config.market}:${config.interval}:${config.days}`}
          config={config}
          simCandles={state.simCandles}
          initialCandles={state.contextCandles}
          simStartMs={state.simStartMs}
          endMs={state.endMs}
          engine={state.engine}
          onExit={() => void navigate({ to: "/backtest" })}
          onLiveTrade={() =>
            void navigate({ to: "/trade", search: { market: config.market } })
          }
          onSaved={(backtestId) =>
            void navigate({ to: "/backtest", search: { run: backtestId } })
          }
          onRestart={() => {
            setState((s) => ({
              ...s,
              engine: new ManualSession({
                simStartMs: s.simStartMs,
                startingEquity: config.equity,
                riskPct: config.riskPct,
                costs: DEFAULT_BACKTEST_COSTS,
              }),
            }))
            setSessionNonce((n) => n + 1)
          }}
        />
      ) : null}
    </div>
  )
}

function ActiveSession({
  config,
  simCandles,
  initialCandles,
  simStartMs,
  endMs,
  engine,
  onExit,
  onLiveTrade,
  onSaved,
  onRestart,
}: {
  config: PracticeConfig
  /** Session-interval candles inside the window — what the engine trades. */
  simCandles: HistoryCandle[]
  /** Session-interval candles including the deep context runway. */
  initialCandles: HistoryCandle[]
  simStartMs: number
  endMs: number
  engine: ManualSession
  onExit: () => void
  /** Leaves for the live Trade terminal on this session's market. */
  onLiveTrade: () => void
  onSaved: (backtestId: string) => void
  onRestart: () => void
}) {
  const sessionInterval = config.interval
  const sessionStepMs = INTERVAL_MS[sessionInterval]

  // Display timeframe: the session's own interval or finer, like the run
  // chart — coarser candles would blend bars the engine hasn't seen yet.
  const [displayInterval, setDisplayInterval] =
    React.useState<CandleInterval>(sessionInterval)
  const displayStepMs = INTERVAL_MS[displayInterval as BacktestInterval]
  const intervalOptions = React.useMemo(
    () =>
      BACKTEST_INTERVALS.filter(
        (iv) => INTERVAL_MS[iv] <= sessionStepMs
      ) as readonly CandleInterval[],
    [sessionStepMs]
  )

  // Candles per display timeframe, fetched on demand and backfilled on
  // scroll. The engine never reads these — it owns its immutable simCandles.
  const [candleStore, setCandleStore] = React.useState<
    Partial<Record<CandleInterval, HistoryCandle[]>>
  >({ [sessionInterval]: initialCandles })
  const candleStoreRef = React.useRef(candleStore)
  React.useEffect(() => {
    candleStoreRef.current = candleStore
  })
  const displayCandles = candleStore[displayInterval] ?? EMPTY_CANDLES

  // The floating second-timeframe window. Defaults to the next coarser
  // timeframe — higher-timeframe context while trading the session interval.
  const defaultMiniInterval = React.useMemo<CandleInterval>(() => {
    const index = BACKTEST_INTERVALS.indexOf(sessionInterval)
    return BACKTEST_INTERVALS[
      Math.min(index + 1, BACKTEST_INTERVALS.length - 1)
    ]
  }, [sessionInterval])
  const [miniOpen, setMiniOpen] = usePersistedState(
    "practice-mini-open",
    false,
    (raw) => JSON.parse(raw) === true
  )
  const [miniInterval, setMiniInterval] = usePersistedState<CandleInterval>(
    "practice-mini-interval",
    defaultMiniInterval,
    (raw) => {
      const parsed: unknown = JSON.parse(raw)
      return BACKTEST_INTERVALS.includes(parsed as BacktestInterval)
        ? (parsed as CandleInterval)
        : defaultMiniInterval
    }
  )

  const [playheadMs, setPlayheadMs] = React.useState(simStartMs)
  const [playing, setPlaying] = React.useState(false)
  // Fastest speed by default — practice is about getting to the next setup,
  // and slowing down is one click away.
  const [speed, setSpeed] = React.useState<ReplaySpeed>(60)
  // Auto-pause: signal arrows while uninvolved, stop/TP exits while trading.
  const [pauseOnSignal, setPauseOnSignal] = usePersistedState(
    "practice-pause-on-signal",
    false,
    (raw) => JSON.parse(raw) === true
  )
  const pauseOnSignalRef = React.useRef(pauseOnSignal)
  React.useEffect(() => {
    pauseOnSignalRef.current = pauseOnSignal
  }, [pauseOnSignal])
  const lastFillCountRef = React.useRef(0)
  const [drawings, setDrawings] =
    React.useState<ChartDrawings>(EMPTY_CHART_DRAWINGS)
  // Skip tripwire: the chart's drag handler checks a continuity invariant on
  // every move event (a drawing may never move further than the pointer did)
  // and reports violations here, frozen on screen until dismissed.
  const [skipReport, setSkipReport] = React.useState<string | null>(null)
  React.useEffect(() => {
    const onAnomaly = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      const at = new Date().toLocaleTimeString("en-US", { hour12: false })
      setSkipReport(`Skip detected at ${at} — ${detail}`)
    }
    window.addEventListener("practice-drag-anomaly", onAnomaly)
    return () => window.removeEventListener("practice-drag-anomaly", onAnomaly)
  }, [])
  // Bumped after every engine mutation so the HUD and markers re-derive.
  const [version, setVersion] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Done finalizes the engine ONCE and caches the scorecard; the summary
  // modal then offers Save / Restart / New run over it.
  const [result, setResult] = React.useState<BacktestResult | null>(null)
  const resultRef = React.useRef<BacktestResult | null>(null)
  const [summaryOpen, setSummaryOpen] = React.useState(false)
  /** Market time played through when Done was pressed. */
  const [playedMs, setPlayedMs] = React.useState(0)
  const [setupOpen, setSetupOpen] = React.useState(false)
  // Restart / New run are explicit discards — no leave-warning after them.
  const [discarded, setDiscarded] = React.useState(false)

  // The user's pinned indicators — the SAME per-user settings the live
  // trading chart uses; edits here persist there too.
  const [indicators, setIndicators] = React.useState<IndicatorConfig[]>([])
  React.useEffect(() => {
    let cancelled = false
    loadIndicators()
      .then((rows) => {
        if (!cancelled) setIndicators(rows)
      })
      .catch(() => {
        // Indicators are decoration — the session works without them.
      })
    return () => {
      cancelled = true
    }
  }, [])
  const updateIndicator = React.useCallback(
    (id: string, patch: Partial<IndicatorConfig>) => {
      setIndicators((current) => {
        const next = current.map((ind) =>
          ind.id === id ? { ...ind, ...patch } : ind
        )
        const row = next.find((ind) => ind.id === id)
        if (row) {
          // Fire-and-forget like the live chart; a lost save is retried the
          // next time the toggle changes.
          void saveIndicator(row).catch(() => {})
        }
        return next
      })
    },
    []
  )
  const pinnedIndicators = React.useMemo(
    () => indicators.filter((ind) => ind.pinned),
    [indicators]
  )

  const atEnd = playheadMs >= endMs

  const nextIndexRef = React.useRef(0)
  const playheadRef = React.useRef(simStartMs)

  // Moves the playhead forward: feeds every newly crossed bar to the engine,
  // then sweeps the boxes it used up (filled-and-closed or expired) off the
  // chart. The one way time advances — playback ticks, steps, and scrubs all
  // come through here, so processing never lives in an effect.
  const advanceTo = React.useCallback(
    (nextMs: number) => {
      // A finalized session is frozen: its scorecard is already computed, so
      // no more bars may run through the engine.
      if (resultRef.current) return
      const clamped = Math.min(Math.max(nextMs, playheadRef.current), endMs)
      playheadRef.current = clamped
      setPlayheadMs(clamped)
      let index = nextIndexRef.current
      let advanced = false
      while (index < simCandles.length && simCandles[index].t <= clamped) {
        engine.processBar(simCandles[index])
        index += 1
        advanced = true
      }
      if (!advanced) return
      nextIndexRef.current = index
      // Auto-pause on trade exits: a stop-out or take-profit fill stops the
      // tape so the result can sink in. Manual closes (deleting the box)
      // don't pause — the user did those on purpose.
      const fills = engine.listFills()
      if (pauseOnSignalRef.current) {
        for (let i = lastFillCountRef.current; i < fills.length; i += 1) {
          const purpose = fills[i].purpose
          if (purpose === "manual:sl" || purpose === "manual:tp") {
            setPlaying(false)
            break
          }
        }
      }
      lastFillCountRef.current = fills.length
      const consumed = engine.drainConsumedBoxes()
      if (consumed.length > 0) {
        setDrawings((current) => ({
          ...current,
          positions: current.positions.filter(
            (position) => !consumed.includes(position.id)
          ),
        }))
      }
      setVersion((v) => v + 1)
    },
    [simCandles, engine, endMs]
  )

  // Playback: advance the playhead speed × bars per second, stop at the end.
  // Time HOLDS while a drawing gesture is in flight — advancing would slide
  // the axis under the pointer (the drag runs away) or pile up off-screen
  // bars that lurch the view the moment the gesture ends.
  //
  // Driven by animation frames off the REAL clock, not a fixed timer with a
  // fixed step. A timer fires again whether or not the last tick finished, so a
  // heavy frame leaves work queued behind it — the callbacks stack up, the page
  // stops responding, and because each one moved time by a fixed amount, 60×
  // silently degrades into something far slower the longer a session runs.
  // Asking for the next frame only after this one is done can never stack, and
  // measuring how long the frame really took keeps 60× at 60×.
  const chartApiRef = React.useRef<PriceChartHandle | null>(null)
  const registerChartApi = React.useCallback((api: PriceChartHandle | null) => {
    chartApiRef.current = api
  }, [])
  React.useEffect(() => {
    if (!playing) return
    let frame = 0
    let previousMs = performance.now()
    const tick = () => {
      const now = performance.now()
      frame = requestAnimationFrame(tick)
      if (chartApiRef.current?.drawingGestureActive()) {
        previousMs = now
        return
      }
      const elapsed = now - previousMs
      // Let time accumulate rather than stepping on every single frame. Each
      // step re-renders the screen and repaints the chart, and doing that sixty
      // times a second is most of the work a fast replay does — while the tape
      // looks exactly the same at thirty, because the playhead still moves by
      // however much real time has passed. Fewer, slightly bigger steps.
      if (elapsed < MIN_STEP_MS) return
      previousMs = now
      const banked = Math.min(elapsed, MAX_FRAME_MS)
      const next = playheadRef.current + sessionStepMs * speed * (banked / 1000)
      if (next >= endMs) setPlaying(false)
      advanceTo(next)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, sessionStepMs, endMs, advanceTo])

  /**
   * The playhead each box was last placed or dragged against. Time carries a
   * resting order's box forward from there, so the box both follows the tape
   * and keeps exactly where it was dropped.
   *
   * Re-anchored on every set the chart hands back — including mid-drag — so the
   * travel offset is always zero while a gesture is in flight. Without that,
   * each pointer move was re-pinned against a stale anchor and sideways drags
   * were undone as fast as they were made: the box would only move up and down.
   */
  const [boxAnchors, setBoxAnchors] = React.useState<Map<string, number>>(
    () => new Map()
  )
  const anchorBoxes = React.useCallback((next: ChartDrawings) => {
    const playheadSec = Math.floor(playheadRef.current / 1000)
    setBoxAnchors(
      new Map(next.positions.map((position) => [position.id, playheadSec]))
    )
  }, [])
  const handleDrawingsChange = React.useCallback(
    (next: ChartDrawings) => {
      setDrawings(next)
      anchorBoxes(next)
    },
    [anchorBoxes]
  )

  // Boxes already seen, so a commit can tell a brand-new plan from an edit.
  const knownBoxIdsRef = React.useRef(new Set<string>())
  const newlyPlaced = React.useCallback((next: ChartDrawings) => {
    const placed: ChartPosition[] = []
    for (const position of next.positions) {
      if (knownBoxIdsRef.current.has(position.id)) continue
      knownBoxIdsRef.current.add(position.id)
      placed.push(position)
    }
    return placed
  }, [])

  const handleDrawingsCommit = React.useCallback(
    (next: ChartDrawings) => {
      // Say that the order is in. Part of a waiting order's box sits in the
      // future, off to the right, so "did that click even land?" is a fair
      // question — and answering it wrong means drawing the trade twice.
      for (const box of newlyPlaced(next)) {
        toast.success(
          `${box.side === "long" ? "Buy" : "Sell"} order waiting at ${formatPriceDisplay(box.entry)} — rests until price reaches it. Delete the box to cancel.`
        )
      }
      // Whatever the user just left on screen is where the box belongs now.
      anchorBoxes(next)
      // After Done the drawings are annotation only — the engine is frozen.
      if (resultRef.current) {
        setDrawings(next)
        return
      }
      engine.syncBoxes(next.positions)
      const consumed = engine.drainConsumedBoxes()
      setDrawings(
        consumed.length > 0
          ? {
              ...next,
              positions: next.positions.filter(
                (position) => !consumed.includes(position.id)
              ),
            }
          : next
      )
      setVersion((v) => v + 1)
    },
    [anchorBoxes, engine, newlyPlaced]
  )

  // Timeframes without data yet (the main display, and the mini chart when
  // it's the session interval or finer): fetch their whole span (deep context
  // through now); the server clamps the range to its bar ceiling. Coarser
  // mini timeframes never fetch — they aggregate from revealed candles.
  const neededIntervals = React.useMemo(() => {
    const wanted = new Set<CandleInterval>([displayInterval])
    if (miniOpen && INTERVAL_MS[miniInterval as BacktestInterval] <= sessionStepMs) {
      wanted.add(miniInterval)
    }
    return [...wanted]
  }, [displayInterval, miniOpen, miniInterval, sessionStepMs])
  React.useEffect(() => {
    let cancelled = false
    for (const interval of neededIntervals) {
      if (candleStoreRef.current[interval]) continue
      void loadPracticeCandles({
        market: config.market,
        interval: interval as BacktestInterval,
        fromMs: simStartMs - CONTEXT_BARS * sessionStepMs,
        toMs: Date.now(),
      })
        .then((data) => {
          if (cancelled) return
          setCandleStore((current) => ({
            ...current,
            [interval]: trimToRunway(
              data.candles,
              simStartMs - CONTEXT_BARS * INTERVAL_MS[interval as BacktestInterval]
            ),
          }))
        })
        .catch(() => {
          // A later interval switch retries.
        })
    }
    return () => {
      cancelled = true
    }
  }, [neededIntervals, config.market, simStartMs, sessionStepMs])

  // Scroll-back backfill: keep loading older history for the current display
  // timeframe so support/resistance context never runs out.
  const loadingOlderRef = React.useRef(false)
  const handleVisibleRange = React.useCallback(
    (fromSec: number) => {
      const loaded = candleStoreRef.current[displayInterval]
      const floor = loaded?.[0]?.t
      if (floor === undefined) return
      // Once the display cap is reached, older history can't be shown anyway
      // — backfilling further would fetch in a loop for nothing.
      if ((loaded?.length ?? 0) >= DISPLAY_CANDLE_CAP) return
      const stepMs = INTERVAL_MS[displayInterval as BacktestInterval]
      if (fromSec * 1000 > floor + EDGE_BUFFER_BARS * stepMs) return
      if (loadingOlderRef.current) return
      loadingOlderRef.current = true
      void loadPracticeCandles({
        market: config.market,
        interval: displayInterval as BacktestInterval,
        fromMs: floor - CHUNK_BARS * stepMs,
        toMs: floor,
      })
        .then((data) => {
          if (data.candles.length === 0) return
          setCandleStore((current) => {
            const existing = current[displayInterval]
            if (!existing) return current
            return {
              ...current,
              [displayInterval]: mergeCandles(data.candles, existing),
            }
          })
        })
        .catch(() => {
          // A later scroll retries.
        })
        .finally(() => {
          loadingOlderRef.current = false
        })
    },
    [displayInterval, config.market]
  )

  // Revealed count first, array second: the playhead advances every 100ms
  // tick, but a new ARRAY identity must only appear when a bar is actually
  // revealed — otherwise every tick re-runs the chart's whole indicator and
  // paint pipeline over the full history and playback stutters.
  const revealedCount = countRevealed(displayCandles, playheadMs)
  // Bounded and trimmed in steps — see REPLAY_KEEP_BARS for why it is stepped
  // rather than sliding a bar at a time.
  const visibleCandles = React.useMemo(
    () => trailingWindow(displayCandles, revealedCount),
    [displayCandles, revealedCount]
  )

  // Mini-chart candles at its own timeframe, honest to the playhead: finer or
  // equal timeframes clip fetched candles; coarser ones aggregate the
  // revealed session candles so the newest bucket forms live.
  const miniStepMs = INTERVAL_MS[miniInterval as BacktestInterval]
  const sessionCandles = candleStore[sessionInterval] ?? EMPTY_CANDLES
  const miniSource =
    miniStepMs > sessionStepMs
      ? sessionCandles
      : (candleStore[miniInterval] ?? EMPTY_CANDLES)
  // Same identity discipline as the main chart: recompute only per revealed
  // bar, never per playback tick.
  const miniRevealed = miniOpen ? countRevealed(miniSource, playheadMs) : 0
  const miniCandles = React.useMemo(() => {
    if (!miniOpen) return EMPTY_CANDLES
    const revealed = miniSource.slice(0, miniRevealed)
    const folded =
      miniStepMs > sessionStepMs
        ? aggregateCandles(revealed, miniStepMs)
        : revealed
    // Same stepped window as the main chart — a fine mini timeframe would
    // otherwise hold a month of 1m candles and drag playback down.
    return trailingWindow(folded, folded.length)
  }, [miniOpen, miniSource, miniRevealed, miniStepMs, sessionStepMs])

  // Lettered chips (O = opened, C = closed) so the user's own fills can never
  // be mistaken for indicator signal arrows.
  const fillMarkers = React.useMemo<ChartMarker[]>(
    () =>
      engine.listFills().map((fill) => {
        const isEntry = /^manual:(b|s):/.test(fill.purpose)
        const long = isEntry ? fill.side === "buy" : fill.side === "sell"
        return {
          time: fill.t,
          side: fill.side,
          price: fill.px,
          letter: isEntry ? ("O" as const) : ("C" as const),
          color: long ? CHIP_COLORS.long : CHIP_COLORS.short,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, version]
  )

  // The pinned indicators' derived paint (signal arrows, zones, bar colors),
  // computed over the revealed candles only — indicators can't see the
  // future. Held to a FIXED span of recent candles rather than everything
  // revealed: this recomputes on every revealed bar, so letting it grow with
  // the session is exactly why an hour into a run the same 60× crawls. A fixed
  // window means minute one and hour three cost the same. 1,200 candles is
  // several screens of scroll-back and far past any indicator's warmup.
  const paintCandles = React.useMemo(
    () =>
      visibleCandles.length > PAINT_CANDLE_CAP
        ? visibleCandles.slice(-PAINT_CANDLE_CAP)
        : visibleCandles,
    [visibleCandles]
  )
  const paint = React.useMemo(
    () => computeIndicatorPaint(pinnedIndicators, paintCandles, displayStepMs),
    [pinnedIndicators, paintCandles, displayStepMs]
  )
  const markers = React.useMemo(
    () => [...fillMarkers, ...paint.markers],
    [fillMarkers, paint.markers]
  )

  // Auto-pause, part 1 — indicator signals: when the newest signal arrow
  // moves forward in time, stop the tape so the user can react. Only while
  // they're uninvolved: with a waiting order or open position on the chart,
  // signal pauses would interrupt trade management (part 2 covers exits).
  // The first computation only seeds the baseline, so signals already in the
  // revealed history never pause a fresh session.
  const lastSignalMsRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    let latest = 0
    for (const marker of paint.markers) {
      if (marker.time > latest) latest = marker.time
    }
    const previous = lastSignalMsRef.current
    lastSignalMsRef.current = latest
    if (previous === null || !pauseOnSignal) return
    if (latest <= previous) return
    const state = engine.snapshot()
    if (state.pendingOrders > 0 || state.positions.length > 0) return
    // Pausing the transport in reaction to freshly derived paint is the whole
    // point here — a one-shot, guarded state write, not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(false)
  }, [paint.markers, pauseOnSignal, engine])


  const snap = React.useMemo(
    () => engine.snapshot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, version]
  )

  /**
   * What the chart actually draws. A box is anchored to the moment it was
   * drawn, which is fine for an annotation and wrong for a live order: at 60×
   * the tape carries it off the left edge in about two seconds, where it can be
   * neither seen nor grabbed — so a resting order looked like it had vanished,
   * and the fix people reach for is to keep dragging it back.
   *
   * A waiting order therefore travels with the tape (nothing has happened yet,
   * so its position in time means nothing), and an open position keeps its left
   * edge at the entry while its right edge follows the tape — the trade's own
   * history, still reachable so its stop and target can be dragged.
   */
  const displayDrawings = React.useMemo(() => {
    // Runs on every step of the tape, so leave early on the common shapes
    // before building anything: nothing drawn, or nothing live to carry.
    if (drawings.positions.length === 0) return drawings
    if (snap.pendingEntries.length === 0 && snap.positions.length === 0) {
      return drawings
    }
    const waiting = new Set(snap.pendingEntries.map((order) => order.boxId))
    const open = new Set(snap.positions.map((position) => position.boxId))
    const playheadSec = Math.floor(playheadMs / 1000)
    let changed = false
    const positions = drawings.positions.map((position) => {
      if (waiting.has(position.id)) {
        // Carry the box forward by however much tape has run since it was last
        // touched. Mid-gesture that is zero, so a drag — sideways included —
        // passes straight through.
        const anchor = boxAnchors.get(position.id) ?? playheadSec
        const shift = playheadSec - anchor
        if (shift === 0) return position
        changed = true
        return {
          ...position,
          startTime: position.startTime + shift,
          endTime: position.endTime + shift,
        }
      }
      if (open.has(position.id) && position.endTime < playheadSec) {
        changed = true
        return { ...position, endTime: playheadSec }
      }
      return position
    })
    return changed ? { ...drawings, positions } : drawings
  }, [boxAnchors, drawings, playheadMs, snap])

  // Unmissable in-trade presence: full-width price lines for the open
  // position's entry/stop/TP and each waiting order's entry, with axis
  // labels — the same language the live terminal speaks.
  const tradeLines = React.useMemo<ChartPriceLine[]>(() => {
    const lines: ChartPriceLine[] = []
    for (const [index, open] of snap.positions.entries()) {
      const long = open.side === "long"
      lines.push({
        id: `live-entry-${index}`,
        price: open.entryPx,
        color: long ? CHART_UP_COLOR : CHART_DOWN_COLOR,
        title: long ? "Long entry" : "Short entry",
        lineWidth: 2,
        axisLabelVisible: true,
      })
      lines.push({
        id: `live-stop-${index}`,
        price: open.stop,
        color: CHART_DOWN_COLOR,
        title: "Stop",
        lineStyle: "dashed",
        axisLabelVisible: true,
      })
      lines.push({
        id: `live-tp-${index}`,
        price: open.target,
        color: CHART_UP_COLOR,
        title: "TP",
        lineStyle: "dashed",
        axisLabelVisible: true,
      })
    }
    for (const [index, order] of snap.pendingEntries.entries()) {
      lines.push({
        id: `live-wait-${index}`,
        price: order.px,
        color: WAITING_ORDER_COLOR,
        title: order.side === "long" ? "Buy waiting" : "Sell waiting",
        lineStyle: "dashed",
        axisLabelVisible: true,
      })
    }
    return lines
  }, [snap])

  // A session with any processed history is worth a warning before losing it
  // — unless the user explicitly discarded it via Restart / New run.
  const shouldBlock = React.useCallback(
    () => engine.barsProcessed > 0 && !saved && !saving && !discarded,
    [engine, saved, saving, discarded]
  )
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock,
    enableBeforeUnload: shouldBlock,
    withResolver: true,
  })

  // Spacebar toggles play/pause. Only when focus sits on a non-interactive
  // spot: a focused button, menu, or field keeps its own native Space
  // behavior (a play/pause button still toggles playback itself, so the
  // shortcut never double-fires or fights a menu's key handling).
  const blocked = blocker.status === "blocked"
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "BUTTON" ||
          target.tagName === "SELECT" ||
          target.tagName === "A" ||
          target.isContentEditable ||
          target.closest?.("[role=menu],[role=listbox],[role=dialog]"))
      ) {
        return
      }
      if (summaryOpen || setupOpen || blocked) return
      if (resultRef.current || atEnd) return
      event.preventDefault()
      setPlaying((current) => !current)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [summaryOpen, setupOpen, blocked, atEnd])

  // Done: freeze the session into its scorecard and show the summary.
  // Nothing is saved yet — that's the modal's "Save run" button.
  function finishSession() {
    setPlaying(false)
    if (!resultRef.current) {
      setPlayedMs(playheadRef.current - simStartMs)
      const finalized = engine.finalize()
      resultRef.current = finalized
      setResult(finalized)
      setVersion((v) => v + 1)
    }
    setError(null)
    setSummaryOpen(true)
  }

  async function saveRun() {
    const finalized = resultRef.current
    if (!finalized) return
    setSaving(true)
    setError(null)
    try {
      const { backtestId } = await saveManualBacktest({
        market: config.market,
        interval: sessionInterval,
        startMs: simStartMs,
        endMs,
        startingEquity: config.equity,
        params: {
          kind: "manual",
          riskPct: config.riskPct,
          boxes: drawings.positions.slice(0, 500),
        },
        costs: DEFAULT_BACKTEST_COSTS,
        result: finalized,
      })
      setSaved(true)
      onSaved(backtestId)
    } catch {
      setError(
        "Saving the run failed. Your scorecard is still here — try Save run again."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-card px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Leave practice session"
          onClick={onExit}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-semibold">
          Practice · {config.market} · {sessionInterval}
        </span>
        <HudStat label="Wallet" value={usd(snap.equity)} />
        <HudStat
          label="Open P&L"
          value={signedUsd(snap.openPnl)}
          tone={snap.openPnl}
        />
        <HudStat
          label="Realized"
          value={signedUsd(snap.realizedPnl)}
          tone={snap.realizedPnl}
        />
        <HudStat
          label="Trades"
          value={`${snap.tradeCount}${
            snap.tradeCount > 0
              ? ` · ${Math.round((snap.wins / snap.tradeCount) * 100)}% win`
              : ""
          }`}
        />
        <HudStat label="Max DD" value={pct(-snap.maxDrawdownPct)} />
        {snap.pendingOrders > 0 ? (
          <HudStat label="Working orders" value={String(snap.pendingOrders)} />
        ) : null}
        {snap.leverage > 0 ? (
          <HudStat label="Leverage" value={`${snap.leverage.toFixed(1)}×`} />
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onLiveTrade}>
            <DollarSignIcon className="size-4" />
            Live Trade
          </Button>
          <Button type="button" onClick={finishSession}>
            {result ? "Summary" : "Done"}
          </Button>
        </div>
      </div>
      {result && !summaryOpen ? (
        <div className="border-b bg-muted/60 px-4 py-1.5 text-xs text-muted-foreground">
          Session ended — open Summary to save it, restart, or start a new run.
        </div>
      ) : snap.halted ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          {snap.haltReason} Press Done to save the session.
        </div>
      ) : atEnd ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          You reached the end of the window. Press Done to save your scorecard.
        </div>
      ) : null}
      {skipReport ? (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-destructive bg-destructive/15 px-4 py-1.5 text-xs font-medium text-destructive"
        >
          <span className="min-w-0 flex-1">{skipReport}</span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setSkipReport(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 p-[var(--shell-gutter,0.75rem)]">
        <WorkspacePanel className="flex h-full flex-col">
          <ChartToolbar
            intervals={intervalOptions}
            interval={displayInterval}
            onIntervalChange={setDisplayInterval}
            afterIntervals={
              <IndicatorsMenu
                indicators={pinnedIndicators}
                onUpdate={updateIndicator}
              />
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 px-2 text-xs",
                miniOpen ? "bg-muted text-foreground" : "text-muted-foreground"
              )}
              aria-pressed={miniOpen}
              onClick={() => setMiniOpen((current) => !current)}
            >
              <PictureInPicture2Icon className="size-3.5" />
              2nd timeframe
            </Button>
          </ChartToolbar>
          <div className="relative min-h-0 flex-1">
            <PriceChartView
              candles={visibleCandles}
              loading={displayCandles.length === 0}
              dataKey={`practice:${config.market}:${displayInterval}`}
              // A trade planned at the live price lives entirely in the
              // future, so the chart has to keep that much room to the right
              // or the box lands off-screen — which is why a placed order
              // looked like a click that never registered.
              rightOffsetBars={PLAN_ROOM_BARS}
              markers={markers}
              priceLines={tradeLines}
              indicators={pinnedIndicators}
              overlayLines={paint.overlayLines}
              zones={paint.zones}
              barColors={paint.barColors}
              drawings={displayDrawings}
              onDrawingsChange={handleDrawingsChange}
              onDrawingsCommit={handleDrawingsCommit}
              onVisibleRangeChange={handleVisibleRange}
              registerApi={registerChartApi}
            />
            {miniOpen ? (
              <PracticeMiniChart
                market={config.market}
                interval={miniInterval}
                intervals={BACKTEST_INTERVALS}
                candles={miniCandles}
                indicators={pinnedIndicators}
                onIntervalChange={setMiniInterval}
                onClose={() => setMiniOpen(false)}
              />
            ) : null}
          </div>
          <ReplayTransport
            playheadMs={atEnd ? null : playheadMs}
            playing={playing}
            speed={speed}
            startMs={simStartMs}
            endMs={endMs}
            barMs={sessionStepMs}
            allowRewind={false}
            endLabel="Session end"
            onScrub={(ms) => {
              setPlaying(false)
              advanceTo(ms)
            }}
            onTogglePlay={() => {
              // A finalized session is frozen — the engine ignores advances,
              // so flipping into "playing" would just spin a dead ticker.
              if (atEnd || result) return
              setPlaying((current) => !current)
            }}
            onStep={() => advanceTo(playheadRef.current + sessionStepMs)}
            onSpeedChange={setSpeed}
            trailing={
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={pauseOnSignal}
                className={cn(
                  "text-[10px]",
                  pauseOnSignal
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                )}
                onClick={() => setPauseOnSignal((current) => !current)}
              >
                Auto-pause
              </Button>
            }
          />
        </WorkspacePanel>
      </div>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Session summary</DialogTitle>
            <DialogDescription>
              {config.market} · {sessionInterval} · {config.days}d — how your
              hand-trading scored.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Scorecard</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <BacktestKpis stats={result?.stats ?? null} />
                {result ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Time traded</span>
                    <span className="text-right font-mono">
                      {formatFocusDays(playedMs / DAY_MS)} of {config.days}d
                    </span>
                    {result.trades.length > 0 ? (
                      <>
                        <span>First entry → last exit</span>
                        <span className="text-right font-mono">
                          {formatFocusDays(
                            (result.trades[result.trades.length - 1].exitTime -
                              result.trades[0].entryTime) /
                              DAY_MS
                          )}
                        </span>
                      </>
                    ) : null}
                    <span>Ending wallet</span>
                    <span className="text-right font-mono">
                      {usd(result.stats.endingEquity)}
                    </span>
                    <span>Fees paid</span>
                    <span className="text-right font-mono">
                      {usd(result.stats.fees)}
                    </span>
                    <span>Buy &amp; hold</span>
                    <span className="text-right font-mono">
                      {pct(result.stats.buyHoldPct)}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setDiscarded(true)
                setSummaryOpen(false)
                setSetupOpen(true)
              }}
            >
              New run
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setDiscarded(true)
                setSummaryOpen(false)
                onRestart()
              }}
            >
              Restart
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void saveRun()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PracticeSetupDialog
        open={setupOpen}
        onOpenChange={(open) => {
          setSetupOpen(open)
          // Backing out of "New run" keeps the unsaved-session warning alive.
          if (!open) setDiscarded(false)
        }}
        initial={config}
      />

      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave practice session?</DialogTitle>
            <DialogDescription>
              This session isn't saved. Leaving now throws away its trades —
              press Done first to keep the scorecard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => blocker.reset?.()}
            >
              Keep practicing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              Leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function HudStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: number
}) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono font-medium ${tone === undefined ? "" : toneClass(tone)}`}
      >
        {value}
      </span>
    </span>
  )
}

// Dev-only: practice sessions hold live engine and playback state that does
// not survive hot swapping coherently — stale module generations show up as
// drawings "skipping". Any edit reaching this module reloads the page.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate()
  })
}
