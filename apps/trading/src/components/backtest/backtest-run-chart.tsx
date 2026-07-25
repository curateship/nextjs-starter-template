import * as React from "react"

import {
  PriceChartView,
  type ChartFocusPoint,
  type ChartFocusResult,
  type ChartOverlayLine,
  type ChartPriceLine,
} from "@/components/chart/price-chart"
import { CHART_DOWN_COLOR, CHART_UP_COLOR } from "@/components/chart/chart-markers"
import { ChartToolbar } from "@/components/chart/chart-toolbar"
import { useChartDrawings } from "@/components/chart/use-chart-drawings"
import type { TradingNetwork } from "@/lib/hl/network"
import { configOverlays } from "@/components/chart/indicator-overlays"
import { orderLabelFor } from "@/lib/automations/node-registry"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  loadBacktestCandles,
  loadBacktestTimeline,
  type BacktestDetail,
} from "@/lib/api/backtests"
import { indicatorDisplayName } from "@/lib/trading/indicators-config"
import { usePersistedState } from "@/lib/use-persisted-state"
import {
  INTERVAL_MS,
  type BacktestTimeline,
  type BacktestTrade,
} from "@/lib/backtest/types"
import type { CandleInterval } from "@/lib/hl/ws"
import type { HistoryCandle } from "@/server/backtest/history"
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"

import { formatFocusDays, pct, signedUsd } from "./backtest-format"
import {
  buildRunMarkers,
  buildTrailingStopOverlays,
  type StrategyChartOverlays,
} from "./backtest-overlays"

const EMPTY_CANDLES: HistoryCandle[] = []
const EMPTY_OVERLAYS: StrategyChartOverlays = {
  indicators: [],
  overlayLines: [],
  priceLines: [],
  zones: [],
  barColors: [],
}

// Progressive candle loading: open on a small recent window, extend to a month
// in the background, then back-fill older history on demand (scroll or replay).
const DAY_MS = 86_400_000
const INITIAL_DAYS = 10
const BACKGROUND_DAYS = 30
const CHUNK_DAYS = 30
/** Start loading older history when the view's left edge is within this of the loaded floor. */
const EDGE_BUFFER_MS = 2 * DAY_MS

/** Replay tick; the playhead advances speed × bars each second. */
const TICK_MS = 100
const SPEED_OPTIONS = [1, 5, 15, 60] as const

/** Amber for resting entry ladders — matches the Visualize mode's QFL lines. */
const LADDER_COLOR = "#f59e0b"

/** Merge two candle sets, de-duped by open time and sorted ascending. */
function mergeCandles(a: HistoryCandle[], b: HistoryCandle[]): HistoryCandle[] {
  const byTime = new Map<number, HistoryCandle>()
  for (const candle of a) byTime.set(candle.t, candle)
  for (const candle of b) byTime.set(candle.t, candle)
  return [...byTime.values()].sort((x, y) => x.t - y.t)
}

// Synthetic show/hide groups with no canvas node behind them.
const BAR_COLORS_GROUP = "::bar-colors"
const TRAILING_GROUP = "::trailing-stop"

/**
 * Paint ids are prefixed with their canvas node ("nodeId:series" or
 * "nodeId@4h:series") — one show/hide group per node, HTF clock included.
 */
function paintGroupKey(id: string): string {
  return id.split(":")[0].split("@")[0]
}

/** Fallback label from an unlabeled line id: "abc123:swing-high" → "Swing high". */
function paintGroupLabel(id: string): string {
  const suffix = id.slice(id.indexOf(":") + 1).replace(/[-_:]/g, " ").trim()
  if (!suffix) return "Marks"
  return suffix.charAt(0).toUpperCase() + suffix.slice(1)
}

/**
 * Show/hide menu for the automation's own paint. The set is fixed to what
 * the canvas nodes drew, with the run's saved settings — nothing can be
 * added or edited here, only hidden.
 */
function RunPaintMenu({
  groups,
  hidden,
  onToggle,
}: {
  groups: { key: string; label: string }[]
  hidden: Set<string>
  onToggle: (key: string) => void
}) {
  if (groups.length === 0) return null
  const visibleCount = groups.filter((group) => !hidden.has(group.key)).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
        >
          Indicators{visibleCount ? ` (${visibleCount})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-1 p-2">
        <div className="px-1 py-1 text-[10px] text-muted-foreground">
          What this automation draws — with its saved settings. Show or hide
          only.
        </div>
        {groups.map((group) => (
          <div
            key={group.key}
            className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
          >
            <Checkbox
              id={`paint-${group.key}`}
              checked={!hidden.has(group.key)}
              onCheckedChange={() => onToggle(group.key)}
            />
            <label
              htmlFor={`paint-${group.key}`}
              className="flex-1 cursor-pointer text-left text-xs font-medium"
            >
              {group.label}
            </label>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/**
 * A dropped tune-drag on the run chart: the editor rewrites the matching
 * node's setting from it (the rule — never a per-order override).
 */
export type BacktestTuneDrag =
  | {
      kind: "tp" | "sl"
      price: number
      /** Entry price of the position under the playhead — the % anchor. */
      anchor: number
      side: "long" | "short"
    }
  | { kind: "crack"; price: number; base: number }

/**
 * The one chart for a finished backtest run — used by the standalone backtest
 * page and the editor's backtest mode. Handles progressive candle loading,
 * overlay/marker assembly, trade focus, and replay: a transport bar plays the
 * run's recording forward, revealing candles, fills, and the engine's recorded
 * pending orders / SL–TP levels only up to the playhead.
 */
export function BacktestRunChart({
  run,
  focusedTrade = null,
  onLastCloseChange,
  toolbarLeading,
  toolbarActions,
  extraPriceLines,
  onLineDragEnd,
  onTuneDrag,
}: {
  /** A finished run (status "done" with a result). */
  run: BacktestDetail
  /** Trade to focus (from the trades table); the chart zooms to its window. */
  focusedTrade?: BacktestTrade | null
  /** Last visible close — the mark price for open-position P&L rows. */
  onLastCloseChange?: (close: number | null) => void
  /** Left toolbar slot (market symbol etc.). */
  toolbarLeading?: React.ReactNode
  /** Right toolbar slot (mode buttons, menus). */
  toolbarActions?: React.ReactNode
  /** Extra lines from the parent (e.g. the editor's draggable tune lines). */
  extraPriceLines?: ChartPriceLine[]
  /** Drop handler for draggable extra lines. */
  onLineDragEnd?: (id: string, price: number) => void
  /**
   * Makes the recorded stop/TP/first-ladder lines draggable; a drop reports
   * the new price with its anchor so the editor can rewrite the rule.
   */
  onTuneDrag?: (change: BacktestTuneDrag) => void
}) {
  const result = run.result
  const interval = run.interval as CandleInterval
  const runStartMs = React.useMemo(() => Date.parse(run.startTime), [run.startTime])
  const runEndMs = React.useMemo(() => Date.parse(run.endTime), [run.endTime])
  const barMs = INTERVAL_MS[interval] ?? 60_000
  const reqKey = `run:${run.id}:${interval}`

  const [chartState, setChartState] = React.useState<{
    key: string
    candles: HistoryCandle[]
  }>({ key: "", candles: EMPTY_CANDLES })
  const chartStateRef = React.useRef(chartState)
  React.useEffect(() => {
    chartStateRef.current = chartState
  })
  // Drawings are saved per market, so a line drawn here is the same line the
  // live chart shows for this market.
  const { drawings, onDrawingsChange, onDrawingsCommit } = useChartDrawings({
    network: run.network as TradingNetwork,
    market: run.market,
  })

  // Replay: null = live end (no clipping). Scrubbing backwards forces a chart
  // data reset (the series only grows gracefully), tracked by a nonce.
  const [playheadMs, setPlayheadMs] = React.useState<number | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [speed, setSpeed] = React.useState<(typeof SPEED_OPTIONS)[number]>(5)
  const [resetNonce, setResetNonce] = React.useState(0)
  const lastPlayheadRef = React.useRef<number | null>(null)
  const [timeline, setTimeline] = React.useState<BacktestTimeline | null>(null)

  // The chart draws exactly what the automation drew — its own indicators
  // with the node's saved settings. The menu can only show/hide them, keyed
  // by canvas node id (so a hide sticks per automation, across re-runs).
  const [hiddenPaint, setHiddenPaint] = usePersistedState<string[]>(
    "backtest-paint-hidden",
    [],
    (raw) => {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : []
    }
  )
  const hiddenSet = React.useMemo(() => new Set(hiddenPaint), [hiddenPaint])
  const togglePaintGroup = (key: string) =>
    setHiddenPaint((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key]
    )

  // Initial slice: the run's most recent days, in one shot.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await loadBacktestCandles(run.id, interval, {
          fromMs: Math.max(runStartMs, runEndMs - INITIAL_DAYS * DAY_MS),
          toMs: runEndMs,
        })
        if (!cancelled) {
          setChartState({ key: reqKey, candles: data.candles })
        }
      } catch {
        // Transient fetch failure — keep the previous chart.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [run.id, interval, reqKey, runStartMs, runEndMs])

  // Background: extend back to a month so a little scrolling needs no fetch.
  React.useEffect(() => {
    if (chartState.key !== reqKey) return
    const floor = chartState.candles[0]?.t
    if (floor === undefined) return
    const target = Math.max(runStartMs, runEndMs - BACKGROUND_DAYS * DAY_MS)
    if (target >= floor) return
    let cancelled = false
    void (async () => {
      try {
        const data = await loadBacktestCandles(run.id, interval, {
          fromMs: target,
          toMs: floor,
        })
        if (!cancelled) {
          setChartState((s) =>
            s.key === reqKey
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
  }, [run.id, interval, reqKey, runStartMs, runEndMs, chartState.key])

  // The replay tape — its own lazy fetch, never part of the run payload.
  React.useEffect(() => {
    let cancelled = false
    setTimeline(null)
    loadBacktestTimeline(run.id)
      .then((tape) => {
        if (!cancelled) setTimeline(tape)
      })
      .catch(() => {
        // No tape (old run) — the chart still works, just without order lines.
      })
    return () => {
      cancelled = true
    }
  }, [run.id])

  // Load older history back to `targetFromMs` (the server adds warmup behind
  // it) and merge it in. Shared by scroll-back, far-back focus, and replay.
  const loadOlderTo = React.useCallback(
    async (targetFromMs: number): Promise<void> => {
      const s = chartStateRef.current
      if (s.key !== reqKey) return
      const floor = s.candles[0]?.t
      if (floor === undefined || targetFromMs >= floor) return
      try {
        const data = await loadBacktestCandles(run.id, interval, {
          fromMs: targetFromMs,
          toMs: floor,
        })
        setChartState((prev) =>
          prev.key === reqKey
            ? { ...prev, candles: mergeCandles(data.candles, prev.candles) }
            : prev
        )
      } catch {
        // ignore — a later scroll or click retries
      }
    },
    [run.id, interval, reqKey]
  )

  // On-demand: load an older chunk when the user scrolls near the loaded floor.
  const loadingOlderRef = React.useRef(false)
  const handleVisibleRange = React.useCallback(
    (fromSec: number) => {
      const floor = chartStateRef.current.candles[0]?.t
      if (floor === undefined || floor <= runStartMs) return
      if (fromSec * 1000 > floor + EDGE_BUFFER_MS) return
      if (loadingOlderRef.current) return
      loadingOlderRef.current = true
      const target = Math.max(runStartMs, floor - CHUNK_DAYS * DAY_MS)
      void loadOlderTo(target).finally(() => {
        loadingOlderRef.current = false
      })
    },
    [runStartMs, loadOlderTo]
  )

  // Focus arrives as a prop; committing may need older candles loaded first —
  // otherwise the chart jumps to a time with only a few stray candles.
  const [committedFocus, setCommittedFocus] =
    React.useState<BacktestTrade | null>(null)
  React.useEffect(() => setCommittedFocus(null), [run.id])
  React.useEffect(() => {
    if (!focusedTrade) {
      setCommittedFocus(null)
      return
    }
    // Focusing a trade parks the replay just past its exit, so the scrubber
    // and the chart tell the same moment's story (a few bars of context past
    // the exit; at the run's end the playhead returns to the live edge).
    setPlaying(false)
    const parkAt = focusedTrade.exitTime + 5 * barMs
    setPlayheadMs(parkAt >= runEndMs ? null : parkAt)
    const floor = chartStateRef.current.candles[0]?.t
    if (floor !== undefined && focusedTrade.entryTime < floor) {
      let cancelled = false
      void loadOlderTo(Math.max(runStartMs, focusedTrade.entryTime)).finally(
        () => {
          if (!cancelled) setCommittedFocus(focusedTrade)
        }
      )
      return () => {
        cancelled = true
      }
    }
    setCommittedFocus(focusedTrade)
  }, [focusedTrade, runStartMs, runEndMs, barMs, loadOlderTo])

  // Pulsing rings on the focused trade's entry and exit arrows. Sides match
  // the arrows: a long enters with a buy and exits with a sell.
  const focusPoints = React.useMemo<ChartFocusPoint[]>(() => {
    if (!committedFocus) return []
    const long = committedFocus.side === "long"
    return [
      {
        time: committedFocus.entryTime,
        side: long ? "buy" : "sell",
        label: "Entry",
        price: committedFocus.entryPx,
      },
      {
        time: committedFocus.exitTime,
        side: long ? "sell" : "buy",
        label: "Exit",
        price: committedFocus.exitPx,
      },
    ]
  }, [committedFocus])

  const focusResult = React.useMemo<ChartFocusResult | null>(() => {
    if (!committedFocus) return null
    const spanMs = committedFocus.exitTime - committedFocus.entryTime
    const days = spanMs / DAY_MS
    return {
      up: committedFocus.pnl >= 0,
      pctText: pct(committedFocus.returnPct),
      pnlText: signedUsd(committedFocus.pnl),
      bars: Math.max(1, Math.round(spanMs / barMs)),
      daysText: formatFocusDays(days),
    }
  }, [committedFocus, barMs])

  // Replay playback: advance the playhead speed × bars per second.
  React.useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setPlayheadMs((prev) => {
        const current = prev ?? runStartMs
        const next = current + barMs * speed * (TICK_MS / 1000)
        if (next >= runEndMs) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [playing, speed, barMs, runStartMs, runEndMs])

  // Scrubbing backwards shrinks the candle series — force a data reset.
  React.useEffect(() => {
    const last = lastPlayheadRef.current
    if (
      playheadMs !== null &&
      (last === null || playheadMs < last)
    ) {
      setResetNonce((n) => n + 1)
    }
    lastPlayheadRef.current = playheadMs
  }, [playheadMs])

  const setPlayhead = React.useCallback(
    (ms: number | null) => {
      if (ms === null || ms >= runEndMs) {
        setPlayheadMs(null)
        return
      }
      // Any rewind needs the full run's candles behind it.
      void loadOlderTo(runStartMs)
      setPlayheadMs(Math.max(runStartMs, ms))
    },
    [runStartMs, runEndMs, loadOlderTo]
  )

  const candles = chartState.key === reqKey ? chartState.candles : EMPTY_CANDLES
  const chartLoading = chartState.key !== reqKey

  // Everything the chart shows is clipped to the playhead, so the future
  // genuinely isn't visible while replaying.
  const cutoff = playheadMs
  const visibleCandles = React.useMemo(() => {
    if (cutoff === null) return candles
    let lo = 0
    let hi = candles.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (candles[mid].t <= cutoff) lo = mid + 1
      else hi = mid
    }
    return candles.slice(0, lo)
  }, [candles, cutoff])

  const runConfig = run.params

  const overlays = React.useMemo(() => {
    if (visibleCandles.length === 0 || !runConfig) return EMPTY_OVERLAYS
    return configOverlays(runConfig, visibleCandles)
  }, [runConfig, visibleCandles])

  // A trailing-stop run paints its per-trade stop path (dashed red) so the
  // ratchet is visible; clipped to the playhead like everything else.
  const trailingStopLines = React.useMemo<ChartOverlayLine[]>(() => {
    if (!result || !runConfig || visibleCandles.length === 0) return []
    return buildTrailingStopOverlays(runConfig.protection, result, visibleCandles)
  }, [result, runConfig, visibleCandles])

  // One menu row per canvas node that painted something, plus the synthetic
  // candle-coloring / trailing-path rows. Labels come from the node's own
  // paint (indicator display name, else a labeled line, else its id).
  const paintGroups = React.useMemo(() => {
    const groups = new Map<string, string>()
    for (const indicator of overlays.indicators) {
      const key = paintGroupKey(indicator.id)
      if (!groups.has(key)) groups.set(key, indicatorDisplayName(indicator))
    }
    for (const line of overlays.overlayLines) {
      const key = paintGroupKey(line.id)
      if (!groups.has(key)) groups.set(key, line.label || paintGroupLabel(line.id))
    }
    for (const zone of overlays.zones) {
      const key = paintGroupKey(zone.id)
      if (!groups.has(key)) groups.set(key, "Zones")
    }
    if (overlays.barColors.length > 0) {
      groups.set(BAR_COLORS_GROUP, "Candle coloring")
    }
    if (trailingStopLines.length > 0) {
      groups.set(TRAILING_GROUP, "Trailing stop path")
    }
    return [...groups.entries()].map(([key, label]) => ({ key, label }))
  }, [overlays, trailingStopLines])

  const chartIndicators = React.useMemo(
    () =>
      overlays.indicators.filter(
        (indicator) => !hiddenSet.has(paintGroupKey(indicator.id))
      ),
    [overlays.indicators, hiddenSet]
  )
  const chartZones = React.useMemo(
    () => overlays.zones.filter((zone) => !hiddenSet.has(paintGroupKey(zone.id))),
    [overlays.zones, hiddenSet]
  )
  const chartOverlayLines = React.useMemo(
    () => [
      ...overlays.overlayLines.filter(
        (line) => !hiddenSet.has(paintGroupKey(line.id))
      ),
      ...(hiddenSet.has(TRAILING_GROUP) ? [] : trailingStopLines),
    ],
    [overlays.overlayLines, trailingStopLines, hiddenSet]
  )
  const labeledOverlayLines = chartOverlayLines.filter((line) => line.label)

  const markers = React.useMemo(() => {
    if (!result) return []
    const all = buildRunMarkers(result)
    if (cutoff === null) return all
    return all.filter((marker) => marker.time <= cutoff)
  }, [result, cutoff])

  // Fold the tape up to the playhead: what was resting on the book, and where
  // the stop/TP sat, at this exact moment of the run.
  const tapeState = React.useMemo(() => {
    const events = timeline?.events
    if (!events?.length) return null
    const limit = cutoff ?? Number.POSITIVE_INFINITY
    const orders = new Map<string, { side: "buy" | "sell"; px: number }>()
    let stopPx: number | null = null
    let tpPx: number | null = null
    let qflBase: number | null = null
    for (const event of events) {
      if (event.t > limit) break
      if (event.k === "order") {
        if (event.op === "place" || event.op === "move") {
          orders.set(event.purpose, { side: event.side, px: event.px })
        } else {
          orders.delete(event.purpose)
        }
      } else if (event.k === "protect") {
        stopPx = event.stopPx
        tpPx = event.tpPx
      } else if (event.k === "qfl") {
        qflBase = event.base
      }
    }
    return { orders, stopPx, tpPx, qflBase }
  }, [timeline, cutoff])

  // Entry price + side of the position under the playhead — the anchor a
  // dropped stop/TP line converts back into a rule percentage.
  const tuneAnchor = React.useMemo(() => {
    if (!result || !onTuneDrag) return null
    const at = cutoff ?? runEndMs
    const trade = result.trades.find(
      (candidate) => candidate.entryTime <= at && at <= candidate.exitTime
    )
    if (trade) return { entryPx: trade.entryPx, side: trade.side }
    const open = result.openPosition
    if (open && open.entryTime <= at) {
      return { entryPx: open.entryPx, side: open.side }
    }
    return null
  }, [result, onTuneDrag, cutoff, runEndMs])

  const tapeLines = React.useMemo<ChartPriceLine[]>(() => {
    if (!tapeState) return []
    const lines: ChartPriceLine[] = []
    for (const [purpose, order] of tapeState.orders) {
      if (!(order.px > 0)) continue
      const firstRung = purpose === "qfl:b:0"
      lines.push({
        id: `tape:order:${purpose}`,
        price: order.px,
        color: order.side === "buy" ? LADDER_COLOR : CHART_UP_COLOR,
        title: orderLabelFor(purpose),
        lineStyle: "dashed",
        axisLabelVisible: false,
        draggable: firstRung && Boolean(onTuneDrag && tapeState.qflBase),
      })
    }
    const protectDraggable = Boolean(tuneAnchor)
    if (tapeState.stopPx) {
      lines.push({
        id: "tape:stop",
        price: tapeState.stopPx,
        color: CHART_DOWN_COLOR,
        title: "Stop",
        lineStyle: "dashed",
        draggable: protectDraggable,
      })
    }
    if (tapeState.tpPx) {
      lines.push({
        id: "tape:tp",
        price: tapeState.tpPx,
        color: CHART_UP_COLOR,
        title: "TP",
        lineStyle: "dashed",
        draggable: protectDraggable,
      })
    }
    if (tapeState.qflBase) {
      lines.push({
        id: "tape:qfl-base",
        price: tapeState.qflBase,
        color: LADDER_COLOR,
        title: "Base",
        lineWidth: 1,
      })
    }
    return lines
  }, [tapeState, tuneAnchor, onTuneDrag])

  const handleLineDragEnd = React.useCallback(
    (id: string, price: number) => {
      if (id.startsWith("tape:")) {
        if (!onTuneDrag) return
        if (id === "tape:stop" && tuneAnchor) {
          onTuneDrag({
            kind: "sl",
            price,
            anchor: tuneAnchor.entryPx,
            side: tuneAnchor.side,
          })
        } else if (id === "tape:tp" && tuneAnchor) {
          onTuneDrag({
            kind: "tp",
            price,
            anchor: tuneAnchor.entryPx,
            side: tuneAnchor.side,
          })
        } else if (id === "tape:order:qfl:b:0" && tapeState?.qflBase) {
          onTuneDrag({ kind: "crack", price, base: tapeState.qflBase })
        }
        return
      }
      onLineDragEnd?.(id, price)
    },
    [onTuneDrag, tuneAnchor, tapeState, onLineDragEnd]
  )

  const priceLines = React.useMemo(
    () => [...overlays.priceLines, ...tapeLines, ...(extraPriceLines ?? [])],
    [overlays.priceLines, tapeLines, extraPriceLines]
  )

  const barColors = React.useMemo(() => {
    if (hiddenSet.has(BAR_COLORS_GROUP)) return []
    if (cutoff === null) return overlays.barColors
    return overlays.barColors.filter((bar) => bar.time <= cutoff)
  }, [overlays.barColors, cutoff, hiddenSet])

  // Mark price follows the playhead so open-position P&L tells the same story.
  const lastVisible = visibleCandles.length
    ? visibleCandles[visibleCandles.length - 1]
    : null
  const lastClose = lastVisible ? Number(lastVisible.c) : null
  React.useEffect(() => {
    onLastCloseChange?.(lastClose)
  }, [lastClose, onLastCloseChange])


  const playheadLabel =
    cutoff === null
      ? null
      : new Date(cutoff).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })

  const cycleSpeed = () => {
    const index = SPEED_OPTIONS.indexOf(speed)
    setSpeed(SPEED_OPTIONS[(index + 1) % SPEED_OPTIONS.length])
  }

  if (!result) return null

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ChartToolbar
        intervals={[interval]}
        interval={interval}
        onIntervalChange={() => {}}
        legend={{ chips: true }}
        legendLines={labeledOverlayLines}
        leading={toolbarLeading}
        afterIntervals={
          <RunPaintMenu
            groups={paintGroups}
            hidden={hiddenSet}
            onToggle={togglePaintGroup}
          />
        }
      >
        {toolbarActions}
      </ChartToolbar>
      <div className="relative min-h-0 flex-1">
        <PriceChartView
          candles={visibleCandles}
          loading={chartLoading}
          dataKey={`${reqKey}:${resetNonce}`}
          indicators={chartIndicators}
          overlayLines={chartOverlayLines}
          priceLines={priceLines}
          zones={chartZones}
          barColors={barColors}
          markers={markers}
          // Deliberately no visibleStartMs: framing to the whole simulated
          // window loads the chart zoomed in. Load at the same default view
          // Reset View gives instead.
          focusPoints={focusPoints}
          focusResult={focusResult}
          drawings={drawings}
          onDrawingsChange={onDrawingsChange}
          onDrawingsCommit={onDrawingsCommit}
          onVisibleRangeChange={handleVisibleRange}
          onLineDragEnd={handleLineDragEnd}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Jump to start"
          onClick={() => setPlayhead(runStartMs)}
        >
          <ChevronFirstIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Step back one bar"
          onClick={() => setPlayhead((cutoff ?? runEndMs) - barMs)}
        >
          <ChevronLeftIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => {
            if (playing) {
              setPlaying(false)
              return
            }
            // Play from the start when parked at the live edge.
            if (cutoff === null) setPlayhead(runStartMs)
            setPlaying(true)
          }}
        >
          {playing ? (
            <PauseIcon className="size-3.5" />
          ) : (
            <PlayIcon className="size-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Step forward one bar"
          disabled={cutoff === null}
          onClick={() => setPlayhead((cutoff ?? runEndMs) + barMs)}
        >
          <ChevronRightIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Jump to end"
          disabled={cutoff === null}
          onClick={() => {
            setPlaying(false)
            setPlayhead(null)
          }}
        >
          <ChevronLastIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="w-9 font-mono text-[10px]"
          aria-label="Replay speed"
          onClick={cycleSpeed}
        >
          {speed}×
        </Button>
        <input
          type="range"
          aria-label="Replay position"
          className="min-w-0 flex-1 accent-foreground"
          min={runStartMs}
          max={runEndMs}
          step={barMs}
          value={cutoff ?? runEndMs}
          onChange={(event) => {
            setPlaying(false)
            setPlayhead(Number(event.target.value))
          }}
        />
        <span className="w-28 text-right font-mono text-[10px] text-muted-foreground">
          {playheadLabel ?? "Live end"}
        </span>
      </div>
    </div>
  )
}
