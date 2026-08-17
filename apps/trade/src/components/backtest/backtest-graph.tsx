import * as React from "react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/format/format-time"
import {
  formatCompactUsd,
  formatUsd,
  formatUsdRounded,
} from "@/lib/trade/format"
import {
  GRAPH_PRESETS,
  barAt,
  graphView,
  linePath,
  potHeight,
  potScale,
  potTicks,
  type BacktestRunTrade,
  type GraphPreset,
  type GraphSeries,
  type GraphWindow,
} from "@/lib/trade/backtest/graph"
import { cn } from "@/lib/utils"

/**
 * The pot over the whole run, and a way to ask a question of it.
 *
 * **Drag a box across it and the page answers for that stretch of time.** Every
 * tile in the panel beside this one recounts itself for the dragged window, so
 * "what happened in February" stops being a thing you work out by eye. Dragging
 * does not zoom: the line stays where it is, with the stretch you picked shaded
 * inside the shape of the whole run, because a figure with no picture around it
 * is the thing this screen was already bad at.
 *
 * **Drawn by hand rather than by Recharts**, unlike the small chart in the left
 * panel. Three things here have no Recharts shape: a band that follows a drag,
 * an underwater strip along the bottom on its own scale, and a crosshair that
 * reads five numbers at once. The gestures are copied from `measure-layer.tsx`,
 * which solved the same problem for the ruler on the trading chart — a capture
 * sheet over the plot, pointer capture, and a slop distance so a click is not a
 * one-pixel selection.
 */

/** Below this a press is a click, not a drag. Same figure as the ruler's. */
const DRAG_SLOP = 3

const PAD_LEFT = 58
const PAD_RIGHT = 12
const AXIS_HEIGHT = 26

const PRESET_LABELS: Record<GraphPreset, string> = {
  "1w": "1W",
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  all: "All",
}

type Overlays = { offPeak: boolean; liquidations: boolean; inCoins: boolean }

export function BacktestGraph({
  series,
  trades,
  startingUsd,
  window,
  onWindow,
}: {
  series: GraphSeries
  /** Null until the run's trades arrive, or on a run too old to have them. */
  trades: readonly BacktestRunTrade[] | null
  startingUsd: number
  window: GraphWindow
  onWindow: (next: GraphWindow) => void
}) {
  const [box, setBox] = React.useState({ width: 900, height: 420 })
  const [hover, setHover] = React.useState<number | null>(null)
  const [drag, setDrag] = React.useState<[number, number] | null>(null)
  const [overlays, setOverlays] = React.useState<Overlays>({
    offPeak: true,
    liquidations: true,
    inCoins: true,
  })
  const pressRef = React.useRef<{ x: number } | null>(null)
  const plotRef = React.useRef<HTMLDivElement | null>(null)

  // Its own size, because an SVG cannot ask for one. There is no shared hook
  // for this in the app — the trading chart lets its library measure itself —
  // so the observer lives here with the only component that needs it.
  React.useEffect(() => {
    const element = plotRef.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width < 20 || rect.height < 20) return
      setBox((old) =>
        Math.round(rect.width) === old.width &&
        Math.round(rect.height) === old.height
          ? old
          : { width: Math.round(rect.width), height: Math.round(rect.height) }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { view, stats } = React.useMemo(
    () => graphView(series, window),
    [series, window]
  )
  const [v0, v1] = view

  const plotWidth = Math.max(80, box.width - PAD_LEFT - PAD_RIGHT)
  const mainHeight = Math.max(120, box.height - AXIS_HEIGHT)
  // The wallet's pane stops where the underwater strip starts, so the two never
  // draw over each other.
  const stripHeight = overlays.offPeak
    ? Math.max(26, Math.min(56, Math.round(box.height * 0.15)))
    : 0
  const paneHeight = Math.max(90, mainHeight - stripHeight)

  const shape = React.useMemo(() => {
    return buildShape({
      series,
      trades,
      overlays,
      v0,
      v1,
      startingUsd,
      plotWidth,
      paneHeight,
      mainHeight,
      stripTop: paneHeight,
    })
  }, [
    series,
    trades,
    overlays,
    v0,
    v1,
    startingUsd,
    plotWidth,
    paneHeight,
    mainHeight,
  ])

  const xOf = (bar: number) =>
    PAD_LEFT + ((bar - v0) / Math.max(1, v1 - v0)) * plotWidth
  const barAtX = (x: number) => {
    const share = Math.max(0, Math.min(1, (x - PAD_LEFT) / plotWidth))
    return Math.round(v0 + share * (v1 - v0))
  }

  const localX = (event: React.PointerEvent<HTMLDivElement>) =>
    event.clientX - event.currentTarget.getBoundingClientRect().left

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    // The press belongs to the graph; without this a drag across it starts the
    // browser selecting the numbers above it instead.
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const bar = barAtX(localX(event))
    pressRef.current = { x: event.clientX }
    setDrag([bar, bar])
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const bar = barAtX(localX(event))
    setHover(bar)
    setDrag((old) => (old ? [old[0], bar] : old))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const held = drag
    const press = pressRef.current
    pressRef.current = null
    setDrag(null)
    if (!held) return
    // A click clears the box rather than picking a single bar — the gesture
    // that made a selection is the one that should take it away again.
    const travelled = press && Math.abs(event.clientX - press.x) > DRAG_SLOP
    onWindow({
      ...window,
      sel:
        travelled && Math.abs(held[1] - held[0]) > 1
          ? [Math.min(held[0], held[1]), Math.max(held[0], held[1])]
          : null,
    })
  }

  // Never outside what is drawn. Changing the window with the pointer still
  // over the plot leaves a hovered bar that the new view may not contain, and
  // the crosshair would then be drawn past the edge of the chart, over the
  // dates.
  const cursor = Math.max(v0, Math.min(hover ?? stats[1], v1))
  const reading = readAt(series, trades, cursor)
  const band = drag ?? window.sel
  const bandBox = band
    ? {
        x: Math.min(xOf(band[0]), xOf(band[1])),
        width: Math.abs(xOf(band[1]) - xOf(band[0])),
      }
    : null

  const scoped =
    window.sel !== null ||
    window.preset !== "all" ||
    window.from !== null ||
    window.to !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0">
          {/* What it is worth now, and what it began with, on one line — the
              second number is only there to be read against the first, and a
              row below put a line break between the two halves of one
              comparison. Rounded, because a starting pot is a round number
              somebody typed and "$10,000.00" spends two characters saying it
              has no pence. */}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
              {reading ? formatUsd(reading.usd) : "—"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              from {formatUsdRounded(startingUsd)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Wallet · {readingWhen(series, cursor)}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          <OverlayToggle
            label="Off peak"
            on={overlays.offPeak}
            swatch="bg-red-600 dark:bg-red-400"
            onClick={() =>
              setOverlays((old) => ({ ...old, offPeak: !old.offPeak }))
            }
          />
          <OverlayToggle
            label="Liquidations"
            on={overlays.liquidations}
            swatch="bg-red-600 dark:bg-red-400"
            onClick={() =>
              setOverlays((old) => ({
                ...old,
                liquidations: !old.liquidations,
              }))
            }
          />
          <OverlayToggle
            label="In markets"
            on={overlays.inCoins}
            swatch="bg-teal-600 dark:bg-teal-400"
            onClick={() =>
              setOverlays((old) => ({ ...old, inCoins: !old.inCoins }))
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {/* Sits with the controls rather than over the plot: down there it
            landed on the dates along the bottom. */}
        <span className="text-xs text-muted-foreground">
          {stats[1] - stats[0] + 1} bars shown
          {scoped ? null : " · drag across the graph to scope every figure to it"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Tabs
            value={window.preset}
            onValueChange={(value) =>
              onWindow({
                ...window,
                preset: value as GraphPreset,
                from: null,
                to: null,
                sel: null,
              })
            }
          >
            <TabsList className="h-8">
              {GRAPH_PRESETS.map((preset) => (
                <TabsTrigger key={preset} value={preset} className="text-xs">
                  {PRESET_LABELS[preset]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DatePicker
            value={window.from === null ? undefined : new Date(window.from)}
            placeholder="From"
            className="h-8 w-auto text-xs"
            onChange={(date) =>
              onWindow({
                ...window,
                from: date ? date.getTime() : null,
                sel: null,
              })
            }
          />
          <DatePicker
            value={window.to === null ? undefined : new Date(window.to)}
            placeholder="To"
            className="h-8 w-auto text-xs"
            onChange={(date) =>
              onWindow({ ...window, to: date ? date.getTime() : null, sel: null })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            // Never disabled: a button that is the way out of a state should
            // still be pressable when you are not sure you are in it.
            onClick={() => onWindow({ preset: "all", from: null, to: null, sel: null })}
          >
            Reset
          </Button>
        </div>
      </div>

      <div
        ref={plotRef}
        data-slot="backtest-graph"
        className="relative min-h-0 flex-1 cursor-crosshair select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setHover(null)
          setDrag(null)
          pressRef.current = null
        }}
      >
        <svg
          width={box.width}
          height={mainHeight}
          className="block text-foreground"
          aria-hidden="true"
        >
          {shape.ticks.map((tick) => (
            <line
              key={tick.value}
              x1={PAD_LEFT}
              y1={tick.y}
              x2={box.width - PAD_RIGHT}
              y2={tick.y}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
          ))}

          {bandBox && bandBox.width > 0 ? (
            <rect
              x={bandBox.x}
              y={0}
              width={bandBox.width}
              height={mainHeight}
              className="fill-teal-600/10 dark:fill-teal-400/10"
            />
          ) : null}

          {shape.inCoinsArea ? (
            <path
              d={shape.inCoinsArea}
              className="fill-teal-600/15 dark:fill-teal-400/15"
            />
          ) : null}

          <path d={shape.walletArea} fill="currentColor" fillOpacity={0.08} />

          {overlays.offPeak ? (
            <>
              <line
                x1={PAD_LEFT}
                y1={paneHeight}
                x2={box.width - PAD_RIGHT}
                y2={paneHeight}
                stroke="currentColor"
                strokeOpacity={0.12}
              />
              <path
                d={shape.offPeakArea}
                className="fill-red-600/15 dark:fill-red-400/15"
              />
              <path
                d={shape.offPeakLine}
                fill="none"
                strokeWidth={1.2}
                className="stroke-red-600 dark:stroke-red-400"
              />
            </>
          ) : null}

          {/* What it started with, so above or below the line is the whole
              answer at a glance. */}
          <line
            x1={PAD_LEFT}
            y1={shape.startY}
            x2={box.width - PAD_RIGHT}
            y2={shape.startY}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
          />

          <path
            d={shape.walletLine}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Each ✕ is a trade the exchange took off you, at the moment it went
              and at what the pot was worth then. They cluster on a bad day
              because that is what happened on it. */}
          {overlays.liquidations
            ? shape.liquidations.map((mark, index) => (
                <g
                  key={`${mark.x}:${index}`}
                  className="stroke-red-600 dark:stroke-red-400"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                >
                  <line
                    x1={mark.x - 4}
                    y1={mark.y - 4}
                    x2={mark.x + 4}
                    y2={mark.y + 4}
                  />
                  <line
                    x1={mark.x - 4}
                    y1={mark.y + 4}
                    x2={mark.x + 4}
                    y2={mark.y - 4}
                  />
                </g>
              ))
            : null}

          {hover !== null ? (
            <>
              <line
                x1={xOf(cursor)}
                y1={0}
                x2={xOf(cursor)}
                y2={mainHeight}
                stroke="currentColor"
                strokeOpacity={0.4}
                strokeDasharray="3 3"
              />
              <circle
                cx={xOf(cursor)}
                cy={shape.yOf(series.usd[cursor] ?? 0)}
                r={3.5}
                className="fill-background"
                stroke="currentColor"
                strokeWidth={1.6}
              />
            </>
          ) : null}
        </svg>

        {shape.ticks.map((tick) => (
          <div
            key={tick.value}
            className="pointer-events-none absolute text-right font-mono text-[11px] text-muted-foreground tabular-nums"
            style={{ top: tick.y - 7, left: 0, width: PAD_LEFT - 10 }}
          >
            {formatCompactUsd(tick.value)}
          </div>
        ))}

        {overlays.offPeak && shape.worstOffPeak < 0 ? (
          <div
            className="pointer-events-none absolute font-mono text-[11px] whitespace-nowrap text-red-600/80 dark:text-red-400/80"
            style={{ top: paneHeight - 16, left: PAD_LEFT + 4 }}
          >
            Off peak · worst {shape.worstOffPeak.toFixed(1)}%
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0" style={{ top: mainHeight + 4 }}>
          {shape.dates.map((tick) => (
            <span
              key={tick.at}
              className="absolute text-[11px] whitespace-nowrap text-muted-foreground"
              style={{ left: xOf(tick.bar), transform: tick.shift }}
            >
              {formatDate(new Date(tick.at))}
            </span>
          ))}
        </div>

        {hover !== null && reading ? (
          <div
            className="pointer-events-none absolute top-0 min-w-44 rounded-lg border bg-popover px-2.5 py-2 text-[11px] shadow-md"
            style={{
              left: Math.max(
                4,
                Math.min(Math.max(4, box.width - 190), xOf(cursor) + 12)
              ),
            }}
          >
            <div className="mb-1 text-muted-foreground">
              {readingWhen(series, cursor)}
            </div>
            <ReadingRow label="Wallet" value={formatUsd(reading.usd)} />
            <ReadingRow
              label="Off peak"
              value={`${reading.offPeakPct.toFixed(2)}%`}
              className="text-red-600 dark:text-red-400"
            />
            <ReadingRow label="In markets" value={formatUsd(reading.inCoins)} />
            <ReadingRow
              label="Open"
              value={reading.open === null ? "—" : String(reading.open)}
            />
            <ReadingRow
              label="Realised"
              value={reading.banked === null ? "—" : formatUsd(reading.banked)}
            />
          </div>
        ) : null}

      </div>
    </div>
  )
}

function ReadingRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-medium tabular-nums", className)}>
        {value}
      </span>
    </div>
  )
}

function OverlayToggle({
  label,
  on,
  swatch,
  onClick,
}: {
  label: string
  on: boolean
  swatch: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-1.5 text-xs",
        on ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <span
        className={cn("inline-block size-2 rounded-full", on ? swatch : "bg-muted-foreground/40")}
      />
      {label}
    </button>
  )
}

/** "Apr 5, 2026 · 08:00" — the moment the crosshair is standing on. */
function readingWhen(series: GraphSeries, bar: number): string {
  const at = series.t[bar]
  if (at === undefined) return "—"
  const when = new Date(at)
  const hour = String(when.getUTCHours()).padStart(2, "0")
  return `${formatDate(when)} · ${hour}:00`
}

function readAt(
  series: GraphSeries,
  trades: readonly BacktestRunTrade[] | null,
  bar: number
): {
  usd: number
  offPeakPct: number
  inCoins: number
  open: number | null
  banked: number | null
} | null {
  if (series.usd[bar] === undefined) return null
  return {
    usd: series.usd[bar],
    offPeakPct: series.offPeakPct[bar] ?? 0,
    inCoins: series.inPlay[bar] ?? 0,
    // A dash, not a zero: before the trades arrive "none were open" is an
    // answer this screen has not earned.
    open: trades && series.openCount ? series.openCount[bar] : null,
    banked: trades && series.banked ? series.banked[bar] : null,
  }
}

/**
 * Every path, tick and mark for one view of the run, worked out once.
 *
 * Kept out of the component so a mouse move over the plot redraws a crosshair
 * rather than rebuilding a line of a hundred thousand points.
 */
function buildShape({
  series,
  trades,
  overlays,
  v0,
  v1,
  startingUsd,
  plotWidth,
  paneHeight,
  mainHeight,
  stripTop,
}: {
  series: GraphSeries
  trades: readonly BacktestRunTrade[] | null
  overlays: Overlays
  v0: number
  v1: number
  startingUsd: number
  plotWidth: number
  paneHeight: number
  mainHeight: number
  stripTop: number
}) {
  const { usd, inPlay, offPeakPct, t } = series
  const scale = potScale(usd, v0, v1)
  const xOf = (bar: number) =>
    PAD_LEFT + ((bar - v0) / Math.max(1, v1 - v0)) * plotWidth

  const top = paneHeight - 6
  const yOf = potHeight(scale, top, paneHeight - 18)

  const line = (values: readonly number[], y: (value: number) => number) =>
    linePath(values, v0, v1, xOf, y)
  const area = (
    values: readonly number[],
    y: (value: number) => number,
    floor: number
  ) => linePath(values, v0, v1, xOf, y, floor)

  let worstOffPeak = 0
  let mostInCoins = 1
  for (let bar = v0; bar <= v1; bar++) {
    if (offPeakPct[bar] < worstOffPeak) worstOffPeak = offPeakPct[bar]
    if ((inPlay[bar] ?? 0) > mostInCoins) mostInCoins = inPlay[bar]
  }

  const offPeakY = (value: number) =>
    stripTop + 2 + (value / Math.min(-0.001, worstOffPeak)) * (mainHeight - stripTop - 5)
  // In coins is drawn against the bottom of the wallet's pane at a fifth of its
  // height: it is a second reading in different money, and letting it use the
  // whole pane would have it read as the pot.
  const inCoinsY = (value: number) =>
    top - (value / mostInCoins) * (paneHeight * 0.22)

  const ticks = potTicks(scale).map((value) => ({
    value,
    y: yOf(value),
  }))

  const wanted = Math.max(3, Math.min(8, Math.floor(plotWidth / 132)))
  const dates = Array.from({ length: wanted + 1 }, (_, step) => {
    const bar = Math.round(v0 + (step / wanted) * (v1 - v0))
    return {
      bar,
      at: t[bar] ?? 0,
      shift:
        step === 0
          ? "translateX(0)"
          : step === wanted
            ? "translateX(-100%)"
            : "translateX(-50%)",
    }
  })

  const liquidations =
    overlays.liquidations && trades
      ? trades
          .filter((trade) => trade.liquidated && trade.exitAt !== null)
          .map((trade) => {
            const bar = barAt(t, trade.exitAt as number)
            return { bar, x: xOf(bar), y: yOf(usd[bar] ?? 0) }
          })
          .filter((mark) => mark.bar >= v0 && mark.bar <= v1)
      : []

  return {
    yOf,
    startY: yOf(startingUsd),
    walletLine: line(usd, yOf),
    walletArea: area(usd, yOf, top),
    inCoinsArea: overlays.inCoins && inPlay.length ? area(inPlay, inCoinsY, top) : "",
    offPeakLine: overlays.offPeak ? line(offPeakPct, offPeakY) : "",
    offPeakArea: overlays.offPeak ? area(offPeakPct, offPeakY, stripTop) : "",
    worstOffPeak,
    ticks,
    dates,
    liquidations,
  }
}
