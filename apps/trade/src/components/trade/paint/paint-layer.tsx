import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import { LineAlertPopover } from "@/components/trade/paint/line-alert-popover"
import type { PaintTool } from "@/components/trade/paint/use-drawings"
import {
  nearestWickTip,
  projectCandleWicks,
  type WickTip,
} from "@/components/trade/paint/wick-snap"
import type { CandleBar } from "@/lib/protocols/contracts"
import {
  describeDrawing,
  drawingAlertArmed,
  moveShape,
  priceAtTime,
  type Drawing,
  type DrawingPoint,
  type DrawingShape,
} from "@/lib/trade/drawings"
import { formatPrice } from "@/lib/trade/format"

/**
 * The lines themselves, drawn over the candles.
 *
 * Everything here is in the chart's coordinates and nothing here is in the
 * chart's code: it is handed a surface that answers "where does this time and
 * this price land?" and draws SVG on top. Ordinary elements rather than a
 * second canvas, because that is what makes a line something the Tab key can
 * reach and a screen reader can read out.
 *
 * The layer lets clicks through by default — the chart underneath still pans,
 * zooms and shows its crosshair. Only the lines themselves take the pointer,
 * plus a full-size sheet while a tool is in hand.
 */

/** How far the pointer must travel before a press counts as a drag. */
const DRAG_SLOP = 3
/** Candle highs and lows inside this screen-pixel circle take the point. */
const WICK_SNAP_RADIUS = 8
/** A still touch held this long switches snapping off for that drawing. */
const TOUCH_HOLD_MS = 500
const TOUCH_HOLD_SLOP = 8

type ScreenPoint = { x: number; y: number }

type Segment = { x1: number; y1: number; x2: number; y2: number }

/** Which part of a line was picked up. */
type GrabPart = "body" | "from" | "to"

type Grab = {
  id: string
  part: GrabPart
  /** Where the market was under the pointer when it went down. */
  at: DrawingPoint
  /** And where on screen, so a click can be told from a drag. */
  from: ScreenPoint
  original: DrawingShape
  shape: DrawingShape
  moved: boolean
}

/** A trendline being drawn: two points, the second still following the mouse. */
type PendingLine = {
  from: DrawingPoint
  to: DrawingPoint
  /** The real pointer-down pixel, before a nearby wick changes the point. */
  startedAt: ScreenPoint
  /** The pointer has been let go and the end is waiting for a second click. */
  anchored: boolean
  /** A long touch at the first end keeps both ends under the finger. */
  skipSnap: boolean
}

type PointerReading = {
  local: ScreenPoint
  point: DrawingPoint
  snap: WickTip | null
}

type TouchHold = {
  pointerId: number
  startedAt: ScreenPoint
  point: DrawingPoint
  timer: ReturnType<typeof setTimeout> | null
  skipped: boolean
}

function useLiveCandleReader(
  candles: readonly CandleBar[],
  watchLiveBars?: (onBar: (bar: CandleBar) => void) => () => void
) {
  const current = React.useRef<CandleBar | null>(null)
  React.useEffect(() => {
    current.current = null
    if (!watchLiveBars) return
    let newestTime = candles.at(-1)?.openTime ?? 0
    return watchLiveBars((bar) => {
      // The chart rejects out-of-order ticks before drawing them. The snap
      // reader has to make the same cut or a late bar can offer an invisible
      // wick that the canvas never accepted.
      if (bar.openTime < newestTime) return
      newestTime = bar.openTime
      // The chart applies this same bar straight to its canvas. Keeping the
      // latest value outside state gives snapping the wick that is visible
      // without re-rendering every layer on every market tick.
      current.current = bar
    })
  }, [candles, watchLiveBars])
  return React.useCallback(() => current.current, [])
}

/** Where a press landed, in the layer's own pixels. */
function localPoint(event: React.PointerEvent<SVGElement>): ScreenPoint | null {
  const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
  return box
    ? { x: event.clientX - box.left, y: event.clientY - box.top }
    : null
}

/** Far enough apart to have meant a drag rather than a click. */
function apart(a: ScreenPoint, b: ScreenPoint): boolean {
  return Math.abs(a.x - b.x) > DRAG_SLOP || Math.abs(a.y - b.y) > DRAG_SLOP
}

function movedPast(a: ScreenPoint, b: ScreenPoint, distance: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) > distance
}

function preferredTip(
  first: WickTip | null,
  second: WickTip | null,
  pointer: ScreenPoint
): WickTip | null {
  if (!first) return second
  if (!second) return first
  const firstVertical = Math.abs(first.y - pointer.y)
  const secondVertical = Math.abs(second.y - pointer.y)
  if (secondVertical < firstVertical) return second
  if (secondVertical > firstVertical) return first
  return Math.abs(second.x - pointer.x) < Math.abs(first.x - pointer.x)
    ? second
    : first
}

/** Where a picked-up line sits now the pointer has reached this point. */
function dragged(grab: Grab, now: DrawingPoint): DrawingShape {
  if (grab.part === "body") {
    return moveShape(
      grab.original,
      now.time - grab.at.time,
      now.price - grab.at.price
    )
  }
  // Only a trendline has ends, and only its ends are ever handed out.
  if (grab.original.kind !== "trendline") return grab.original
  return grab.part === "from"
    ? { ...grab.original, from: now }
    : { ...grab.original, to: now }
}

function segmentOf(shape: DrawingShape, surface: ChartSurface): Segment | null {
  if (shape.kind === "level") {
    const y = surface.yOf(shape.price)
    return y === null ? null : { x1: 0, y1: y, x2: surface.width, y2: y }
  }
  const y1 = surface.yOf(shape.from.price)
  const y2 = surface.yOf(shape.to.price)
  if (y1 === null || y2 === null) return null
  return {
    x1: surface.xOf(shape.from.time),
    y1,
    x2: surface.xOf(shape.to.time),
    y2,
  }
}

/**
 * The dashed part of a trendline that carries on past its later point to the
 * right edge, on the same slope, or null when the line does not extend or
 * already reaches the edge. Read through the same `priceAtTime` the engine
 * uses, so the dashes land exactly where the alert would fire.
 */
function extensionOf(shape: DrawingShape, surface: ChartSurface): Segment | null {
  if (shape.kind !== "trendline" || shape.extendRight !== true) return null
  const later = shape.to.time >= shape.from.time ? shape.to : shape.from
  const x1 = surface.xOf(later.time)
  if (x1 >= surface.width) return null
  const y1 = surface.yOf(later.price)
  const edgePrice = priceAtTime(shape, surface.timeAt(surface.width))
  const y2 = edgePrice === null ? null : surface.yOf(edgePrice)
  if (y1 === null || y2 === null) return null
  return { x1, y1, x2: surface.width, y2 }
}

/** How far apart the two buttons over a line sit, centre to centre. */
const BUTTON_GAP = 22

/**
 * Where a line's own buttons sit: over its middle, clear of the line. The x
 * is on the left and the cog on the right, a button's width apart, so neither
 * can land on top of the other.
 */
function buttonsOf(
  segment: Segment,
  surface: ChartSurface,
  withCog: boolean
): { remove: ScreenPoint; alert: ScreenPoint } {
  const x = (segment.x1 + segment.x2) / 2
  const y = (segment.y1 + segment.y2) / 2 - 16
  // Kept inside the plot, so a line drawn along the top edge still has a
  // button somebody can reach.
  const spread = withCog ? BUTTON_GAP / 2 : 0
  const middle = Math.min(
    Math.max(x, 12 + spread),
    surface.width - 12 - spread
  )
  const clampedY = Math.min(Math.max(y, 12), surface.height - 12)
  return {
    remove: { x: middle - spread, y: clampedY },
    alert: { x: middle + spread, y: clampedY },
  }
}

/** The small round button over a picked-out line: the x and the cog share it. */
function LineButton({
  at,
  label,
  className,
  onPress,
  children,
}: {
  at: ScreenPoint
  label: string
  className?: string
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      style={{ pointerEvents: "all", cursor: "pointer", outline: "none" }}
      className={className}
      // On the press, not the click: the line underneath takes hold of the
      // pointer on its own press, and a click would arrive after the drag it
      // started.
      onPointerDown={(event) => {
        event.stopPropagation()
        onPress()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onPress()
        }
      }}
    >
      <circle
        cx={at.x}
        cy={at.y}
        r={9}
        className="fill-card stroke-foreground/15"
        strokeWidth={1}
      />
      {children}
    </g>
  )
}

/** The small × over a picked-out line. */
function RemoveButton({
  at,
  label,
  onRemove,
}: {
  at: ScreenPoint
  label: string
  onRemove: () => void
}) {
  return (
    <LineButton
      at={at}
      label={label}
      className="text-muted-foreground hover:text-destructive focus-visible:text-destructive"
      onPress={onRemove}
    >
      <path
        d={`M${at.x - 3.5} ${at.y - 3.5} L${at.x + 3.5} ${at.y + 3.5} M${at.x + 3.5} ${at.y - 3.5} L${at.x - 3.5} ${at.y + 3.5}`}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </LineButton>
  )
}

/**
 * The cog beside the x, which opens the line's alert window. Drawn in the
 * alert colour while the line is armed, so a watched line can be told from a
 * plain one without opening anything.
 */
function AlertButton({
  at,
  label,
  armed,
  onOpen,
}: {
  at: ScreenPoint
  label: string
  armed: boolean
  onOpen: () => void
}) {
  return (
    <LineButton
      at={at}
      label={label}
      className={
        armed
          ? "text-primary hover:text-foreground focus-visible:text-foreground"
          : "text-muted-foreground hover:text-foreground focus-visible:text-foreground"
      }
      onPress={onOpen}
    >
      <g data-line-alert-cog transform={`translate(${at.x} ${at.y})`}>
        {Array.from({ length: 4 }, (_, index) => (
          <line
            key={index}
            x1={0}
            y1={-4.5}
            x2={0}
            y2={4.5}
            transform={`rotate(${index * 45})`}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        ))}
        <circle r={2.2} className="fill-card" stroke="currentColor" strokeWidth={1.5} />
      </g>
    </LineButton>
  )
}

export const PaintLayer = React.memo(function PaintLayer({
  surface,
  candles,
  watchLiveBars,
  drawings,
  tool,
  selectedId,
  onSelect,
  onCreate,
  onMove,
  onDelete,
  onSetAlert,
  onAlertOpen,
}: {
  surface: ChartSurface
  candles: readonly CandleBar[]
  watchLiveBars?: (onBar: (bar: CandleBar) => void) => () => void
  drawings: Drawing[]
  tool: PaintTool | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (shape: DrawingShape) => void
  /** The live price goes with a move so an armed line stays pointed right. */
  onMove: (id: string, shape: DrawingShape, currentPrice: number | null) => void
  onDelete: (id: string) => void
  /**
   * Switch a line's alert on or off. Left out on a chart whose lines are not
   * watched by the engine, where the cog and the double-click are not
   * offered at all.
   */
  onSetAlert?: (id: string, on: boolean, currentPrice: number | null) => void
  /** The alert window is opening: a chance to read the lines again. */
  onAlertOpen?: () => void
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  // The moment the window opened and the live price then, so "where the line
  // is right now" is read once at the press rather than on every render.
  const [alertOpen, setAlertOpen] = React.useState<{
    id: string
    openedAt: number
    price: number | null
  } | null>(null)
  const [grab, setGrab] = React.useState<Grab | null>(null)
  const [hover, setHover] = React.useState<ScreenPoint | null>(null)
  const [pending, setPending] = React.useState<PendingLine | null>(null)
  const [snapTip, setSnapTip] = React.useState<WickTip | null>(null)
  const [altHeld, setAltHeld] = React.useState(false)
  const touchHold = React.useRef<TouchHold | null>(null)
  const readLiveCandle = useLiveCandleReader(candles, watchLiveBars)
  const wickCandles = React.useMemo(
    () =>
      projectCandleWicks(candles, surface, {
        from: surface.timeAt(-WICK_SNAP_RADIUS),
        to: surface.timeAt(surface.width + WICK_SNAP_RADIUS),
      }),
    [candles, surface]
  )

  React.useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltHeld(true)
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltHeld(false)
    }
    const blur = () => setAltHeld(false)
    window.addEventListener("keydown", keyDown)
    window.addEventListener("keyup", keyUp)
    window.addEventListener("blur", blur)
    return () => {
      window.removeEventListener("keydown", keyDown)
      window.removeEventListener("keyup", keyUp)
      window.removeEventListener("blur", blur)
    }
  }, [])

  const clearTouchHold = React.useCallback(() => {
    const timer = touchHold.current?.timer
    if (timer != null) clearTimeout(timer)
    touchHold.current = null
  }, [])

  React.useEffect(() => clearTouchHold, [clearTouchHold, tool])

  // Changing tools — including putting one down with Escape, and the tool
  // putting itself down once it has drawn something — takes the half-finished
  // line and the preview with it. Adjusted during the render that brings the
  // change in, so there is no frame with the old preview still on screen.
  const [lastTool, setLastTool] = React.useState(tool)
  if (tool !== lastTool) {
    setLastTool(tool)
    setPending(null)
    setHover(null)
    setSnapTip(null)
  }

  const pointerReading = (
    event: React.PointerEvent<SVGElement>,
    skipSnap: boolean
  ): PointerReading | null => {
    const local = localPoint(event)
    if (!local) return null
    const price = surface.priceAt(local.y)
    if (price === null) return null
    const raw = { time: surface.timeAt(local.x), price }
    const working = readLiveCandle()
    const rememberedWicks = working
      ? wickCandles.filter((candle) => candle.time !== working.openTime)
      : wickCandles
    const rememberedSnap = skipSnap
      ? null
      : nearestWickTip(rememberedWicks, local.x, local.y, WICK_SNAP_RADIUS)
    const workingSnap =
      skipSnap || !working
        ? null
        : nearestWickTip(
            projectCandleWicks([working], surface),
            local.x,
            local.y,
            WICK_SNAP_RADIUS
          )
    const snap = preferredTip(rememberedSnap, workingSnap, local)
    return {
      local,
      point: snap ? { time: snap.time, price: snap.price } : raw,
      snap,
    }
  }

  const startTouchHold = (
    event: React.PointerEvent<SVGElement>,
    reading: PointerReading
  ) => {
    clearTouchHold()
    if (
      event.pointerType !== "touch" ||
      event.isPrimary === false ||
      pending?.anchored
    ) {
      return
    }
    const hold: TouchHold = {
      pointerId: event.pointerId,
      startedAt: reading.local,
      point: {
        time: surface.timeAt(reading.local.x),
        price: surface.priceAt(reading.local.y) ?? reading.point.price,
      },
      timer: null,
      skipped: false,
    }
    hold.timer = setTimeout(() => {
      if (touchHold.current !== hold) return
      hold.timer = null
      hold.skipped = true
      setSnapTip(null)
      setPending((current) =>
        current && !current.anchored
          ? {
              ...current,
              from: hold.point,
              to: hold.point,
              skipSnap: true,
            }
          : current
      )
    }, TOUCH_HOLD_MS)
    touchHold.current = hold
  }

  // ----- Picking a line up and putting it down --------------------------

  const beginGrab = (
    event: React.PointerEvent<SVGElement>,
    drawing: Drawing,
    part: GrabPart
  ) => {
    // A press with a tool in hand is meant for the sheet above — it is drawing
    // a new line, not taking hold of the one that happens to be under it.
    if (tool) return
    const at = pointerReading(event, true)?.point
    const from = localPoint(event)
    if (!at || !from) return
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(drawing.id)
    setGrab({
      id: drawing.id,
      part,
      at,
      from,
      original: drawing.shape,
      shape: drawing.shape,
      moved: false,
    })
  }

  const continueGrab = (event: React.PointerEvent<SVGElement>) => {
    if (!grab) return
    const canSnap = grab.original.kind === "level" || grab.part !== "body"
    const reading = pointerReading(event, !canSnap || event.altKey || altHeld)
    if (!reading) return
    if (!grab.moved && !apart(reading.local, grab.from)) return
    const shape =
      reading.snap && grab.original.kind === "level"
        ? { kind: "level" as const, price: reading.snap.price }
        : dragged(grab, reading.point)
    setSnapTip(reading.snap)
    setGrab({ ...grab, shape, moved: true })
  }

  const endGrab = (event: React.PointerEvent<SVGElement>) => {
    if (!grab) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const canSnap = grab.original.kind === "level" || grab.part !== "body"
    const reading =
      event.type === "pointercancel"
        ? null
        : pointerReading(event, !canSnap || event.altKey || altHeld)
    const moved =
      grab.moved || (reading !== null && apart(reading.local, grab.from))
    const shape = reading
      ? reading.snap && grab.original.kind === "level"
        ? { kind: "level" as const, price: reading.snap.price }
        : dragged(grab, reading.point)
      : grab.shape
    // A press that never travelled was a click to pick the line out, and
    // saving an unchanged line would be a write for nothing.
    if (moved) onMove(grab.id, shape, currentPrice())
    setGrab(null)
    setSnapTip(null)
  }

  // ----- The alert a line carries -----------------------------------------

  /** The live price, off the working candle first and the last closed one else. */
  const currentPrice = React.useCallback(
    (): number | null =>
      readLiveCandle()?.close ?? candles.at(-1)?.close ?? null,
    [readLiveCandle, candles]
  )

  const openAlert = React.useCallback(
    (id: string) => {
      onSelect(id)
      onAlertOpen?.()
      setAlertOpen({ id, openedAt: Date.now(), price: currentPrice() })
    },
    [onSelect, onAlertOpen, currentPrice]
  )

  // A line that has gone, or a chart that lost its alerts, closes the window
  // during the same render rather than leaving it hanging over nothing.
  const alertDrawing =
    onSetAlert && alertOpen
      ? (drawings.find((drawing) => drawing.id === alertOpen.id) ?? null)
      : null
  if (alertOpen && !alertDrawing) setAlertOpen(null)

  // ----- Drawing a new one ----------------------------------------------

  const sheetDown = (event: React.PointerEvent<SVGElement>) => {
    if (event.button !== 0) return
    // The chart's ordinary touch hold opens the order menu. A paint tool owns
    // the same gesture while its sheet is present.
    event.stopPropagation()
    const skipSnap = event.altKey || altHeld || pending?.skipSnap === true
    const reading = pointerReading(event, skipSnap)
    if (!reading) return
    if (tool === "level") {
      event.currentTarget.setPointerCapture(event.pointerId)
      setSnapTip(reading.snap)
      startTouchHold(event, reading)
      return
    }
    if (tool !== "trendline") return
    if (pending?.anchored) {
      onCreate({ kind: "trendline", from: pending.from, to: reading.point })
      setSnapTip(null)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPending({
      from: reading.point,
      to: reading.point,
      startedAt: reading.local,
      anchored: false,
      skipSnap: false,
    })
    setSnapTip(reading.snap)
    startTouchHold(event, reading)
  }

  const sheetMove = (event: React.PointerEvent<SVGElement>) => {
    const local = localPoint(event)
    const held = touchHold.current
    if (
      local &&
      held?.pointerId === event.pointerId &&
      !held.skipped &&
      movedPast(local, held.startedAt, TOUCH_HOLD_SLOP)
    ) {
      clearTouchHold()
    }
    const reading = pointerReading(
      event,
      event.altKey ||
        altHeld ||
        pending?.skipSnap === true ||
        touchHold.current?.skipped === true
    )
    if (!reading) return
    setHover(reading.local)
    setSnapTip(reading.snap)
    if (pending) setPending({ ...pending, to: reading.point })
  }

  const sheetUp = (event: React.PointerEvent<SVGElement>) => {
    if (event.button !== 0) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const touchSkipped = touchHold.current?.skipped === true
    const reading = pointerReading(
      event,
      event.altKey || altHeld || pending?.skipSnap === true || touchSkipped
    )
    clearTouchHold()
    if (!reading) return

    if (tool === "level") {
      onCreate({ kind: "level", price: reading.point.price })
      setSnapTip(null)
      return
    }
    if (!pending || pending.anchored) return

    // A drag draws the line in one go; a tap leaves the far end following the
    // pointer until a second tap puts it down, which is the only way there is
    // to draw one on a touchscreen.
    if (apart(reading.local, pending.startedAt)) {
      onCreate({
        kind: "trendline",
        from: pending.from,
        to: reading.point,
      })
      setSnapTip(null)
    } else {
      setPending({
        ...pending,
        to: reading.point,
        anchored: true,
        skipSnap: pending.skipSnap || touchSkipped,
      })
    }
  }

  const cancelSheetPointer = () => {
    clearTouchHold()
    setSnapTip(null)
    setPending((current) => (current?.anchored ? current : null))
  }

  // ----- Drawing it all out ----------------------------------------------

  // Where the next line would land, so a tool in hand shows what it is about
  // to do rather than only after the click.
  const preview: Segment | null = pending
    ? segmentOf(
        { kind: "trendline", from: pending.from, to: pending.to },
        surface
      )
    : tool === "level" && hover
      ? {
          x1: 0,
          y1: !altHeld && snapTip ? snapTip.y : hover.y,
          x2: surface.width,
          y2: !altHeld && snapTip ? snapTip.y : hover.y,
        }
      : null

  const visibleSnap = altHeld ? null : snapTip

  return (
    <svg
      ref={svgRef}
      // Marks everything the paint tools own, so a press anywhere else on the
      // page can let the picked line go without this one doing it too.
      data-chart-paint
      width={surface.width}
      height={surface.height}
      className="absolute top-0 left-0"
    >
      {drawings.map((drawing) => {
        const shape = grab?.id === drawing.id ? grab.shape : drawing.shape
        const segment = segmentOf(shape, surface)
        if (!segment) return null
        const selected = drawing.id === selectedId
        const extension = extensionOf(shape, surface)

        return (
          <g
            key={drawing.id}
            className={selected ? "text-foreground" : "text-foreground/55"}
          >
            {/* The picked line is drawn darker and thicker than the rest, and
                that is the whole mark. It used to carry a grey halo as well —
                a band down the chart nobody asked for, and the thing the eye
                landed on instead of the line. The browser's own focus ring is
                turned off below, so this stands in for it: a ring draws a box
                round the whole thing, which on a line running corner to corner
                is a rectangle over half the chart. */}
            <line
              {...segment}
              stroke="currentColor"
              strokeWidth={selected ? 2.5 : 1.5}
            />
            {/* The carried-on part, dashed and thinner so the drawn part
                still reads as the drawn part. It takes no pointer, so a click
                on it reaches the chart rather than picking the line, and a
                screen reader still hears one line. */}
            {extension ? (
              <line
                data-line-extension
                aria-hidden
                {...extension}
                stroke="currentColor"
                strokeWidth={selected ? 1.5 : 1}
                strokeDasharray="4 4"
                style={{ pointerEvents: "none" }}
              />
            ) : null}
            {/* The part the pointer and the Tab key actually meet: a fat
                invisible line over the thin visible one, because a 1.5px
                target is not one. Focus picks the line out, so the darker,
                thicker line above is the focus mark too — one thing to look
                for whether the line was clicked or tabbed to. */}
            <line
              {...segment}
              stroke="currentColor"
              strokeOpacity={0}
              strokeWidth={14}
              strokeLinecap="round"
              style={{
                pointerEvents: "stroke",
                cursor: tool ? "crosshair" : "move",
                outline: "none",
              }}
              tabIndex={0}
              role="button"
              aria-label={describeDrawing(shape, formatPrice)}
              onFocus={() => onSelect(drawing.id)}
              onPointerDown={(event) => beginGrab(event, drawing, "body")}
              onPointerMove={continueGrab}
              onPointerUp={endGrab}
              onPointerCancel={endGrab}
              // The second click of a double-click is a press that never
              // travelled, so no drag starts; and a tool in hand means the
              // sheet above has the pointer, so this never arrives then.
              onDoubleClick={
                onSetAlert ? () => openAlert(drawing.id) : undefined
              }
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault()
                  onDelete(drawing.id)
                }
              }}
            />
            {/* Only the picked-out line shows its ends, and only a trendline
                has ends to show — a level runs the whole width, so there is
                nothing to take hold of but the line itself. */}
            {selected && shape.kind === "trendline"
              ? (["from", "to"] as const).map((end) => (
                  <circle
                    key={end}
                    cx={end === "from" ? segment.x1 : segment.x2}
                    cy={end === "from" ? segment.y1 : segment.y2}
                    r={5}
                    fill="currentColor"
                    style={{ pointerEvents: "all", cursor: "grab" }}
                    onPointerDown={(event) => beginGrab(event, drawing, end)}
                    onPointerMove={continueGrab}
                    onPointerUp={endGrab}
                    onPointerCancel={endGrab}
                  />
                ))
              : null}
            {/* The picked-out line's own way out, for a mouse. The toolbar's bin
                clears the whole chart, and Delete only reaches a line the
                keyboard is on, so without this there is no way to throw away
                one line with the pointer. It hides while a tool is in hand,
                where the sheet above would swallow the click anyway. */}
            {selected && !tool
              ? (() => {
                  const withCog = onSetAlert !== undefined
                  const at = buttonsOf(segment, surface, withCog)
                  const name = describeDrawing(shape, formatPrice).toLowerCase()
                  return (
                    <>
                      <RemoveButton
                        at={at.remove}
                        label={`Delete ${name}`}
                        onRemove={() => onDelete(drawing.id)}
                      />
                      {withCog ? (
                        <AlertButton
                          at={at.alert}
                          label={`Alert on ${name}`}
                          armed={drawingAlertArmed(drawing.alert)}
                          onOpen={() => openAlert(drawing.id)}
                        />
                      ) : null}
                    </>
                  )
                })()
              : null}
          </g>
        )
      })}

      {alertDrawing && alertOpen && onSetAlert
        ? (() => {
            const segment = segmentOf(alertDrawing.shape, surface)
            const at = segment
              ? buttonsOf(segment, surface, true).alert
              : { x: surface.width / 2, y: surface.height / 2 }
            return (
              <LineAlertPopover
                drawing={alertDrawing}
                linePrice={priceAtTime(alertDrawing.shape, alertOpen.openedAt)}
                currentPrice={alertOpen.price}
                svg={svgRef}
                at={{ x: at.x, y: at.y + 9 }}
                open={true}
                onOpenChange={(open) => {
                  if (!open) setAlertOpen(null)
                }}
                // The price is read again at the flip, not at the open: the
                // window can sit there a while and the direction should come
                // from the price at the moment the switch goes on.
                onSetAlert={(on) =>
                  onSetAlert(alertDrawing.id, on, currentPrice())
                }
                // Saved the way a drag is saved: it is the same line with one
                // more thing true of it, and the same optimistic write.
                onSetExtend={(on) => {
                  if (alertDrawing.shape.kind !== "trendline") return
                  onMove(
                    alertDrawing.id,
                    { ...alertDrawing.shape, extendRight: on },
                    currentPrice()
                  )
                }}
              />
            )
          })()
        : null}

      {preview ? (
        <line
          {...preview}
          className="text-foreground/70"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      ) : null}

      {visibleSnap ? (
        <circle
          data-wick-snap
          aria-hidden
          cx={visibleSnap.x}
          cy={visibleSnap.y}
          r={4}
          className="fill-primary stroke-background"
          strokeWidth={2}
          style={{ pointerEvents: "none" }}
        />
      ) : null}

      {/* Laid over everything while a tool is in hand, so a new line can start
          anywhere — including on top of one already there — and so the chart
          does not pan out from under the drawing. */}
      {tool ? (
        <rect
          x={0}
          y={0}
          width={surface.width}
          height={surface.height}
          fill="transparent"
          style={{
            pointerEvents: "all",
            cursor: "crosshair",
            touchAction: "none",
          }}
          onPointerDown={sheetDown}
          onPointerMove={sheetMove}
          onPointerUp={sheetUp}
          onPointerCancel={cancelSheetPointer}
          onPointerLeave={() => {
            setHover(null)
            setSnapTip(null)
          }}
          onContextMenu={(event) => event.preventDefault()}
        />
      ) : null}
    </svg>
  )
})
