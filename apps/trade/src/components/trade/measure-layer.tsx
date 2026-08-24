import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import { formatDuration } from "@/lib/format/format-time"
import { formatChange } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

/**
 * The ruler: hold Shift and drag a box over the candles to read how far a move
 * went and how long it took.
 *
 * Two numbers: how far the price went in percent, and how long that took, in
 * candles and in real time. The old app printed the move in dollars between
 * them, which is the one figure the price axis beside the box already answers.
 *
 * The box is kept in the market's own coordinates — a time and a price per
 * corner, not pixels — so it stays on the candles it was taken on through a
 * new candle arriving, the price scale rescaling itself, and the panel being
 * resized. It is redrawn from those two points every frame rather than stored
 * as a rectangle.
 *
 * Nothing here reaches into the chart to switch panning off the way the old
 * app had to. The sheet below takes the pointer for as long as the ruler is
 * out, so the chart never sees the drag — which also means the chart holds
 * still until the measurement is put away, exactly as it did before.
 *
 * Nothing is saved. A measurement is a question you asked once, not a mark on
 * the chart — the paint tools are for marks.
 */

/** A corner of the box, in the market's own coordinates. */
type MeasurePoint = { time: number; price: number }

/**
 * Where the box is and what the pointer is still allowed to do to it.
 *
 * - `dragging` — the button is down and the far corner follows it.
 * - `following` — the button was pressed and released without travelling, so
 *   the far corner follows the bare pointer until the next click. This is the
 *   only way to draw one on a touchscreen, and it is how the trendline tool
 *   already behaves.
 * - `locked` — put down. The next click anywhere clears it.
 */
type Measure = {
  from: MeasurePoint
  to: MeasurePoint
  stage: "dragging" | "following" | "locked"
}

/** How far the pointer must travel before a press counts as a drag. */
const DRAG_SLOP = 3

/** Roughly how big the two-line label is, for keeping it inside the plot. */
const LABEL_HALF_WIDTH = 56
const LABEL_HALF_HEIGHT = 22

/** Whether a key went to something somebody is writing in. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

export const MeasureLayer = React.memo(function MeasureLayer({
  surface,
  tool,
}: {
  surface: ChartSurface
  /**
   * A drawing tool in hand. The ruler stays out of its way entirely: a press
   * with a tool held is meant for the line being drawn, and Shift is not part
   * of drawing one.
   */
  tool: string | null
}) {
  const [shiftHeld, setShiftHeld] = React.useState(false)
  const [measure, setMeasure] = React.useState<Measure | null>(null)
  // Where the press landed on screen, to tell a drag from a click.
  const pressRef = React.useRef<{ x: number; y: number } | null>(null)

  // Shift arms the ruler; letting go of it disarms — unless a measurement is
  // already under way, which owns the pointer until it is put down or cleared.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Shift held to type a capital letter into the order window is not
      // somebody reaching for the ruler, and the sheet it would raise sits
      // over the chart taking presses meant for it.
      if (event.key === "Shift" && !typing(event.target)) setShiftHeld(true)
      if (event.key === "Escape") setMeasure(null)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShiftHeld(false)
    }
    // Tabbing away with Shift down would otherwise leave the ruler armed over
    // a chart nobody is pointing at, because the keyup lands somewhere else.
    const onBlur = () => setShiftHeld(false)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [])

  // A tool picked up mid-measurement takes the measurement with it. Adjusted
  // during the render that brings the change in, the way the paint tools drop
  // a half-drawn line, so no frame shows a box the pointer no longer owns.
  const [lastTool, setLastTool] = React.useState(tool)
  if (tool !== lastTool) {
    setLastTool(tool)
    setMeasure(null)
  }

  const armed = !tool && (shiftHeld || measure !== null)

  /** Where the pointer is, in the market's own coordinates. */
  const pointAt = (
    event: React.PointerEvent<HTMLDivElement>
  ): MeasurePoint | null => {
    const box = event.currentTarget.getBoundingClientRect()
    const price = surface.priceAt(event.clientY - box.top)
    // A price scale that cannot answer yet, or a chart showing a market at
    // zero, has nothing to measure against — a percentage needs to divide by
    // where it started.
    if (price === null || !(price > 0)) return null
    return { time: surface.timeAt(event.clientX - box.left), price }
  }

  // Where the pointer is, for the crosshair below. This layer covers the plot
  // while shift is held, so the chart underneath sees no pointer at all and
  // drops its own crosshair — taking away the prices shift was held to read.
  // Drawing one here rather than driving the chart's: the library positions
  // its crosshair by candle, and a pixel between two candles is not a candle,
  // which made it jump about and blink out.
  const [pointer, setPointer] = React.useState<{ x: number; y: number } | null>(
    null
  )
  /**
   * Where the pointer is, whether or not the ruler is armed.
   *
   * A ref and not state: it changes with every mouse move and nothing should
   * redraw because of it. It exists for the one moment below.
   */
  const lastSeenRef = React.useRef<{ x: number; y: number } | null>(null)
  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      lastSeenRef.current = { x: event.clientX, y: event.clientY }
    }
    document.addEventListener("pointermove", onMove, { passive: true })
    return () => document.removeEventListener("pointermove", onMove)
  }, [])

  /**
   * The crosshair, the instant Shift goes down — not on the next mouse move.
   *
   * Arming covers the plot, which takes the chart's own crosshair away. This
   * layer draws the replacement, and it used to have nothing to draw until the
   * pointer moved: hold Shift over a price and the crosshair vanished, then
   * snapped back somewhere else the moment your hand twitched. It read as the
   * crosshair skipping about. Where the pointer is standing is already known,
   * so it is used.
   *
   * Done as this element arrives rather than in an effect, because that IS the
   * moment: the sheet is mounted only while the ruler is armed, so it appearing
   * and Shift going down are the same event.
   */
  const attach = React.useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      // Shift let go: the sheet is gone and so is its crosshair.
      setPointer(null)
      return
    }
    const at = lastSeenRef.current
    if (!at) return
    const box = element.getBoundingClientRect()
    const x = at.x - box.left
    const y = at.y - box.top
    // Standing off the plot is standing nowhere; the chart shows no crosshair
    // there either.
    if (x < 0 || y < 0 || x > box.width || y > box.height) return
    setPointer({ x, y })
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only the left button draws one. A right-click is handled below.
    if (event.button !== 0) return
    // The ruler owns this press. Do not let the chart panel also start its
    // long press for an order underneath the measurement.
    event.stopPropagation()
    // Shift-click normally extends the browser's text selection from wherever
    // it last started. This press belongs to the ruler, so keep page text out
    // of the gesture without disabling ordinary selection elsewhere.
    event.preventDefault()
    if (measure?.stage === "locked") {
      setMeasure(null)
      return
    }
    const point = pointAt(event)
    if (!point) return
    if (measure?.stage === "following") {
      setMeasure({ ...measure, to: point, stage: "locked" })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    pressRef.current = { x: event.clientX, y: event.clientY }
    setMeasure({ from: point, to: point, stage: "dragging" })
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })

    if (!measure || measure.stage === "locked") return
    const point = pointAt(event)
    if (point) setMeasure({ ...measure, to: point })
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (measure?.stage !== "dragging") return
    const press = pressRef.current
    pressRef.current = null
    const travelled =
      !press ||
      Math.abs(event.clientX - press.x) > DRAG_SLOP ||
      Math.abs(event.clientY - press.y) > DRAG_SLOP
    // A drag draws and puts down the box in one gesture; a tap leaves the far
    // corner following the pointer until a second tap puts it down.
    setMeasure({ ...measure, stage: travelled ? "locked" : "following" })
  }

  if (!armed) return null

  const reading = measure ? read(measure, surface) : null

  return (
    <div
      ref={attach}
      // As wide as the plot, not the axis beside it, and clipping what runs
      // past its edges — a box dragged off the side stops at the candles. It
      // covers the plot so the chart never sees the drag, and the crosshair
      // is what says the pointer is holding a ruler.
      // `select-none` for the same reason as the preventDefault above: a
      // selection cannot begin in an element that is not selectable, which
      // covers the ways a drag can start that never reach the handler.
      className="absolute inset-y-0 left-0 cursor-crosshair overflow-hidden select-none"
      style={{
        width: surface.width,
        pointerEvents: "all",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Off the plot the chart has no crosshair to show, and leaving a stale
      // one behind would read as a price the pointer is not on.
      onPointerLeave={() => setPointer(null)}
      // A right-click while the ruler is armed puts the ruler away rather than
      // opening the order menu underneath it, which is never what was meant.
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setMeasure(null)
      }}
    >
      {pointer ? (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/40"
            style={{ left: pointer.x }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/40"
            style={{ top: pointer.y }}
          />
        </>
      ) : null}
      {reading ? (
        <>
          <div
            className={cn(
              "absolute border",
              reading.up
                ? "border-emerald-600 bg-emerald-500/15 dark:border-emerald-400"
                : "border-red-600 bg-red-500/15 dark:border-red-400"
            )}
            style={reading.box}
          />
          <div
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-center whitespace-nowrap text-white shadow-md",
              reading.up
                ? "bg-emerald-600 dark:bg-emerald-500"
                : "bg-red-600 dark:bg-red-500"
            )}
            // Centred on the box, then kept inside the plot: a box drawn along
            // an edge still has a label somebody can read.
            style={{
              left: clamp(
                reading.box.left + reading.box.width / 2,
                LABEL_HALF_WIDTH,
                surface.width - LABEL_HALF_WIDTH
              ),
              top: clamp(
                reading.box.top + reading.box.height / 2,
                LABEL_HALF_HEIGHT,
                surface.height - LABEL_HALF_HEIGHT
              ),
            }}
          >
            <div className="text-sm leading-tight font-semibold tabular-nums">
              {reading.percent}
            </div>
            <div className="text-xs leading-tight tabular-nums opacity-90">
              {reading.bars} · {reading.span}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
})

/**
 * The box on screen and the three lines that go in the label.
 *
 * Worked out every render from the two corners' times and prices rather than
 * stored as a rectangle, so the box follows its candles through anything that
 * moves them. Answers null while the price scale cannot yet say where a price
 * lands, which is the frame or two after a market opens.
 */
function read(measure: Measure, surface: ChartSurface) {
  const fromY = surface.yOf(measure.from.price)
  const toY = surface.yOf(measure.to.price)
  if (fromY === null || toY === null) return null

  const fromX = surface.xOf(measure.from.time)
  const toX = surface.xOf(measure.to.time)
  const delta = measure.to.price - measure.from.price
  const bars = Math.abs(
    Math.round(
      surface.barAt(measure.to.time) - surface.barAt(measure.from.time)
    )
  )

  return {
    box: {
      left: Math.min(fromX, toX),
      top: Math.min(fromY, toY),
      width: Math.abs(toX - fromX),
      height: Math.abs(toY - fromY),
    },
    up: delta >= 0,
    percent: formatChange(delta / measure.from.price),
    bars: bars === 1 ? "1 bar" : `${bars} bars`,
    span: formatDuration(Math.abs(measure.to.time - measure.from.time)),
  }
}

/** Keeps a number inside a range, and inside a range that has closed up. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}
