import * as React from "react"
import { useBlocker, useNavigate } from "@tanstack/react-router"

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
import { MarketPicker } from "@/components/trading/market-watchlist"
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
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WorkspacePanel } from "@/components/ui/resizable"
import {
  loadPracticeCandles,
  saveManualBacktest,
} from "@/lib/api/backtests"
import { loadIndicators, saveIndicator } from "@/lib/api/indicators"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import { ManualSession } from "@/lib/backtest/manual-sim"
import {
  MANUAL_RISK_PCT_MAX,
  MANUAL_RISK_PCT_MIN,
} from "@/lib/backtest/manual-types"
import {
  aggregateCandles,
  countRevealed,
  type ReplaySpeed,
} from "@/lib/backtest/replay"
import {
  BACKTEST_INTERVALS,
  DEFAULT_BACKTEST_COSTS,
  INTERVAL_MS,
  maxWindowDays,
  type BacktestInterval,
  type BacktestResult,
} from "@/lib/backtest/types"
import type { CandleInterval } from "@/lib/hl/ws"
import type { ChartDrawings } from "@/lib/trading/chart-drawings"
import { EMPTY_CHART_DRAWINGS } from "@/lib/trading/chart-drawings"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"
import { useMarketFavorites } from "@/lib/trading/use-market-favorites"
import { usePersistedState } from "@/lib/use-persisted-state"
import { cn } from "@/lib/utils"
import type { HistoryCandle } from "@/server/backtest/history"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
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

/** Replay tick; the playhead advances speed × bars each second. */
const TICK_MS = 100
/**
 * History loaded behind the session start so support/resistance context is
 * visible from the first candle (also the indicator warmup runway).
 */
const CONTEXT_BARS = 1500
/** Older-history chunk loaded when the user scrolls near the loaded floor. */
const CHUNK_DAYS = 30
const DAY_MS = 86_400_000
/** Start loading older history when the view's left edge is within this. */
const EDGE_BUFFER_MS = 2 * DAY_MS

const EMPTY_MARKETS: ReadonlySet<string> = new Set()
const EMPTY_CANDLES: HistoryCandle[] = []
/** Most candles the display chart holds at once — playback speed guard. */
const DISPLAY_CANDLE_CAP = 6000
/** Amber for resting entries — the same hue the replay tape uses. */
const WAITING_ORDER_COLOR = "#f59e0b"

export type PracticeConfig = {
  market: string
  interval: BacktestInterval
  days: number
  equity: number
  riskPct: number
}

/** Merge two candle sets, de-duped by open time and sorted ascending. */
function mergeCandles(a: HistoryCandle[], b: HistoryCandle[]): HistoryCandle[] {
  const byTime = new Map<number, HistoryCandle>()
  for (const candle of a) byTime.set(candle.t, candle)
  for (const candle of b) byTime.set(candle.t, candle)
  return [...byTime.values()].sort((x, y) => x.t - y.t)
}

/**
 * The "Practice" setup modal on the Backtest dashboard: pick a market,
 * timeframe, window, wallet, and risk — Start opens the session route.
 */
export function PracticeSetupDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Seeds the form (e.g. "New run" from a session re-opens with its config). */
  initial?: Partial<PracticeConfig>
}) {
  const navigate = useNavigate()
  const markets = useBinanceMarketRows()
  const { favorites, toggleFavorite } = useMarketFavorites()
  const [market, setMarket] = React.useState(initial?.market ?? "BTC")
  const [interval, setInterval] = React.useState<BacktestInterval>(
    initial?.interval ?? "15m"
  )
  const [windowDays, setWindowDays] = React.useState(
    String(initial?.days ?? 30)
  )
  const [equity, setEquity] = React.useState(String(initial?.equity ?? 10000))
  const [riskPct, setRiskPct] = React.useState(String(initial?.riskPct ?? 1))
  const [error, setError] = React.useState<string | null>(null)

  const windowCap = maxWindowDays(interval)

  function start() {
    const days = Math.round(Number(windowDays))
    const startingEquity = Number(equity)
    const risk = Number(riskPct)
    if (!Number.isFinite(days) || days < 1 || days > windowCap) {
      setError(
        `The window must be between 1 and ${windowCap} days at ${interval}.`
      )
      return
    }
    if (!Number.isFinite(startingEquity) || startingEquity <= 0) {
      setError("Starting money must be a positive number.")
      return
    }
    if (
      !Number.isFinite(risk) ||
      risk < MANUAL_RISK_PCT_MIN ||
      risk > MANUAL_RISK_PCT_MAX
    ) {
      setError(
        `Risk per trade must be between ${MANUAL_RISK_PCT_MIN}% and ${MANUAL_RISK_PCT_MAX}%.`
      )
      return
    }
    setError(null)
    // No onOpenChange(false) here: navigation unmounts (or remounts) the
    // host screen, and closing first would reset a session's discard flag
    // and re-arm its leave-warning against this very navigation.
    void navigate({
      to: "/backtest/practice",
      search: {
        market,
        interval,
        days,
        equity: startingEquity,
        risk,
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual practice session</DialogTitle>
          <DialogDescription>
            Rewind the past and trade by drawing long/short boxes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="practice-market">Market</FieldLabel>
                  <MarketPicker
                    rows={markets}
                    selected={market}
                    protectedMarkets={EMPTY_MARKETS}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    metrics={false}
                    modal
                    onSelect={setMarket}
                    trigger={
                      <Button
                        id="practice-market"
                        type="button"
                        variant="outline"
                        className="w-full justify-between sm:w-32"
                      >
                        {market}
                        <ChevronDownIcon className="size-4 text-muted-foreground" />
                      </Button>
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="practice-interval">Timeframe</FieldLabel>
                  <Select
                    value={interval}
                    onValueChange={(value) =>
                      setInterval(value as BacktestInterval)
                    }
                  >
                    <SelectTrigger
                      id="practice-interval"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BACKTEST_INTERVALS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="practice-window"
                    hint={`How far back the session starts. At ${interval} candles it can cover up to ${windowCap} days.`}
                  >
                    Days back
                  </FieldLabel>
                  <Input
                    id="practice-window"
                    type="number"
                    min={1}
                    max={windowCap}
                    value={windowDays}
                    onChange={(event) => setWindowDays(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel htmlFor="practice-equity">
                    Starting money ($)
                  </FieldLabel>
                  <Input
                    id="practice-equity"
                    type="number"
                    min={1}
                    value={equity}
                    onChange={(event) => setEquity(event.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="practice-risk"
                    hint="Each trade is sized so that hitting your stop loses exactly this percent of the wallet. A tighter stop means a bigger position, a wider stop a smaller one."
                  >
                    Risk per trade (%)
                  </FieldLabel>
                  <Input
                    id="practice-risk"
                    type="number"
                    min={MANUAL_RISK_PCT_MIN}
                    max={MANUAL_RISK_PCT_MAX}
                    step={0.25}
                    value={riskPct}
                    onChange={(event) => setRiskPct(event.target.value)}
                  />
                </div>
              </div>
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
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={start}>
            Start session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
        const simCandles = data.candles.filter((c) => c.t >= simStartMs)
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
          contextCandles: data.candles,
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
  }, [config])

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
  const [speed, setSpeed] = React.useState<ReplaySpeed>(5)
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
  const chartApiRef = React.useRef<PriceChartHandle | null>(null)
  const registerChartApi = React.useCallback((api: PriceChartHandle | null) => {
    chartApiRef.current = api
  }, [])
  React.useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      if (chartApiRef.current?.drawingGestureActive()) return
      const next =
        playheadRef.current + sessionStepMs * speed * (TICK_MS / 1000)
      if (next >= endMs) setPlaying(false)
      advanceTo(next)
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing, speed, sessionStepMs, endMs, advanceTo])

  // A box drawn on a fine display timeframe can be only minutes wide — its
  // waiting order would expire within a session bar or two, reading as "my
  // buy never triggers". Every fresh box gets a minimum lifetime of 20
  // SESSION candles from the current playhead; the drawing widens to match
  // so the visible right edge always tells the true expiry.
  const knownBoxIdsRef = React.useRef(new Set<string>())
  const withMinimumLifetime = React.useCallback(
    (next: ChartDrawings): ChartDrawings => {
      const stepSec = sessionStepMs / 1000
      const floorEndSec =
        Math.floor(playheadRef.current / 1000) + 20 * stepSec
      let changed = false
      const positions = next.positions.map((position) => {
        if (knownBoxIdsRef.current.has(position.id)) return position
        knownBoxIdsRef.current.add(position.id)
        if (position.endTime >= floorEndSec) return position
        changed = true
        return { ...position, endTime: floorEndSec }
      })
      return changed ? { ...next, positions } : next
    },
    [sessionStepMs]
  )

  const handleDrawingsCommit = React.useCallback(
    (raw: ChartDrawings) => {
      const next = withMinimumLifetime(raw)
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
    [engine, withMinimumLifetime]
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
            [interval]: data.candles,
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
      if (fromSec * 1000 > floor + EDGE_BUFFER_MS) return
      if (loadingOlderRef.current) return
      loadingOlderRef.current = true
      void loadPracticeCandles({
        market: config.market,
        interval: displayInterval as BacktestInterval,
        fromMs: floor - CHUNK_DAYS * DAY_MS,
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
  // Cap what the chart holds to the recent stretch: a month of 1m candles is
  // ~45k, and repainting + indicator math over all of them on every revealed
  // bar starves the playback clock (time barely moves — orders look like
  // they never trigger). 6,000 candles ≈ 4 days of 1m / 20 days of 5m; the
  // session timeframe and coarser keep their full depth.
  const visibleCandles = React.useMemo(() => {
    const revealed = displayCandles.slice(0, revealedCount)
    return revealed.length > DISPLAY_CANDLE_CAP
      ? revealed.slice(-DISPLAY_CANDLE_CAP)
      : revealed
  }, [displayCandles, revealedCount])

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
    // Same display cap as the main chart — a fine mini timeframe would
    // otherwise hold a month of 1m candles and drag playback down.
    return folded.length > DISPLAY_CANDLE_CAP
      ? folded.slice(-DISPLAY_CANDLE_CAP)
      : folded
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
  // future. Capped to the most recent candles: on a 1m display a month is
  // ~45k candles, and recomputing heavy indicators over all of them on every
  // revealed bar makes playback crawl (which reads as orders never
  // triggering — time is barely moving).
  const paintCandles = React.useMemo(
    () =>
      visibleCandles.length > 4000
        ? visibleCandles.slice(-4000)
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
              markers={markers}
              priceLines={tradeLines}
              indicators={pinnedIndicators}
              overlayLines={paint.overlayLines}
              zones={paint.zones}
              barColors={paint.barColors}
              drawings={drawings}
              onDrawingsChange={setDrawings}
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
