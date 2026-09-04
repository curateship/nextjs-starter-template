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
  describeDrawingInline,
  drawingAlertArmed,
  moveShape,
  namedShape,
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
/**
 * A still touch held this long switches snapping off for a drawing in
 * progress, and on a line already there opens its window. The same numbers
 * the chart's order menu uses, so one finger learns one rule.
 */
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

/** A finger resting on a line, on its way to opening the line's window. */
type LineHold = {
  id: string
  pointerId: number
  target: Element
  from: ScreenPoint
  timer: ReturnType<typeof setTimeout>
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

/**
 * Where a fired alert went off, on screen, or null while the alert is armed,
 * gone, from before the fire point was kept, or off the chart's left or
 * right edge. Kept until the alert is switched on again, which replaces the
 * record, or the line is deleted.
 */
function fireMarkOf(drawing: Drawing, surface: ChartSurface): ScreenPoint | null {
  const alert = drawing.alert
  if (!alert || alert.firedAt === null || alert.firedPrice === undefined) {
    return null
  }
  const x = surface.xOf(alert.firedAt)
  const y = surface.yOf(alert.firedPrice)
  if (y === null || x < 0 || x > surface.width) return null
  return { x, y }
}

/**
 * Where a line's name sits and which way it leans: at the line's left-hand
 * end, turned to the line's own angle so it runs along it.
 *
 * Always the left end, whichever end was drawn first, so the words read left
 * to right rather than upside down on a line drawn backwards. A line whose
 * left end is off the side of the plot is labelled where it comes into view,
 * read along its own slope, so the name never scrolls off with the end.
 */
function labelAnchor(
  segment: Segment
): { x: number; y: number; angle: number } {
  const [from, to] =
    segment.x1 <= segment.x2
      ? [
          { x: segment.x1, y: segment.y1 },
          { x: segment.x2, y: segment.y2 },
        ]
      : [
          { x: segment.x2, y: segment.y2 },
          { x: segment.x1, y: segment.y1 },
        ]
  const across = to.x - from.x
  const angle =
    Math.round((Math.atan2(to.y - from.y, across) * 18000) / Math.PI) / 100
  const x = Math.max(from.x, 0)
  const y = across === 0 ? from.y : from.y + ((to.y - from.y) / across) * (x - from.x)
  return { x, y, angle }
}

/** Every mark over a line is drawn on a chip this big. */
const MARK_RADIUS = 9
/** Centre to centre down the column. */
const MARK_GAP = 20
/**
 * From the line to the first mark's centre. Far enough that the chip clears
 * the round handle on a trendline's end, which is five pixels of its own.
 */
const MARK_INSET = 22
/** How close a chip's centre may come to the edge of the plot. */
const MARK_EDGE = 12
/**
 * Every glyph is drawn on the same 24-unit grid the icon set uses and brought
 * down by the same scale, so the three are one size and one weight by
 * construction rather than by three sets of hand-picked numbers.
 */
const GLYPH_SCALE = 0.45
/** On the 24-unit grid. What lands on screen is this times the scale. */
const GLYPH_STROKE = 3

/**
 * Where a line's marks sit: one column under the line, tucked in at its
 * right-hand end.
 *
 * Under the line and at its end rather than across its middle, because a row
 * of buttons over the middle covers the candles the line was drawn through,
 * which is the part of the chart the line was drawn to point at. The first
 * slot is nearest the line and never moves, so switching an alert on cannot
 * shuffle the buttons out from under the pointer. A line lying too near the
 * bottom of the plot stacks its marks upwards instead.
 */
function markColumn(
  segment: Segment,
  surface: ChartSurface,
  count: number
): { points: ScreenPoint[]; down: boolean } {
  const end =
    segment.x2 >= segment.x1
      ? { x: segment.x2, y: segment.y2 }
      : { x: segment.x1, y: segment.y1 }
  const x = Math.min(
    Math.max(end.x - MARK_RADIUS - 2, MARK_EDGE),
    surface.width - MARK_EDGE
  )
  const furthest = end.y + MARK_INSET + MARK_GAP * (count - 1)
  const down = furthest <= surface.height - MARK_EDGE
  const first = down ? end.y + MARK_INSET : end.y - MARK_INSET
  return {
    down,
    points: Array.from({ length: Math.max(count, 0) }, (_, index) => ({
      x,
      y: first + (down ? 1 : -1) * MARK_GAP * index,
    })),
  }
}

/**
 * The chip every mark shares: one circle, and a glyph drawn on the shared
 * 24-unit grid in the chip's own middle.
 *
 * The bell wears it too, though it is not a button, and every one of them is
 * the muted grey. Three marks at three sizes in three colours read as three
 * unrelated things rather than as one line's own row.
 */
function MarkChip({
  at,
  children,
}: {
  at: ScreenPoint
  children: React.ReactNode
}) {
  return (
    <>
      <circle
        cx={at.x}
        cy={at.y}
        r={MARK_RADIUS}
        className="fill-card stroke-foreground/15"
        strokeWidth={1}
      />
      <g
        transform={`translate(${at.x} ${at.y}) scale(${GLYPH_SCALE}) translate(-12 -12)`}
        fill="none"
        stroke="currentColor"
        strokeWidth={GLYPH_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </>
  )
}

/** The two chips that are buttons: a press, and a keyboard way in. */
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
      <MarkChip at={at}>{children}</MarkChip>
    </g>
  )
}

/** The × that throws the line away, at the foot of the column. */
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
      <path d="M19 5 5 19M5 5l14 14" />
    </LineButton>
  )
}

/**
 * The cog above the x, which opens the line's alert window. Grey like the
 * other two: it used to go the primary colour while the line was armed, and
 * the bell beside it now says that on its own.
 */
function AlertButton({
  at,
  label,
  onOpen,
}: {
  at: ScreenPoint
  label: string
  onOpen: () => void
}) {
  return (
    <LineButton
      at={at}
      label={label}
      className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
      onPress={onOpen}
    >
      <g data-line-alert-cog>
        {Array.from({ length: 4 }, (_, index) => (
          <line
            key={index}
            x1={12}
            y1={2}
            x2={12}
            y2={22}
            transform={`rotate(${index * 45} 12 12)`}
          />
        ))}
        {/* Small enough that a length of each spoke still shows outside it.
            A wider hole eats the spokes and the cog reads as a blot. */}
        <circle cx={12} cy={12} r={3} className="fill-card" />
      </g>
    </LineButton>
  )
}

/**
 * The bell at the head of an armed line's column, nearest the line. It takes
 * no pointer and says nothing to a screen reader, which hears the line's own
 * label instead.
 */
function ArmedBell({ at }: { at: ScreenPoint }) {
  return (
    <g
      data-line-bell
      aria-hidden
      className="text-muted-foreground"
      style={{ pointerEvents: "none" }}
    >
      <MarkChip at={at}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </MarkChip>
    </g>
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
  onSetBuffer,
  onAlertOpen,
  wide = true,
  lineAlertsPaused = false,
  extendNewLines = true,
  onExtendPreference,
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
  /** The percentage past the line before an armed alert fires, or none. */
  onSetBuffer?: (id: string, buffer: number | null) => void
  /** The alert window is opening: a chance to read the lines again. */
  onAlertOpen?: () => void
  /** The shell's 1280-pixel layout answer. Narrow puts the window in a sheet. */
  wide?: boolean
  /** The master switch in Settings is off, which the window says. */
  lineAlertsPaused?: boolean
  /** A newly drawn trendline carries on to the right edge. */
  extendNewLines?: boolean
  /**
   * The Continuous line switch was flipped on a line: the answer to
   * remember for the next line drawn. Left out where nothing remembers it.
   */
  onExtendPreference?: (on: boolean) => void
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  // The moment the window opened and the live price then, so "where the line
  // is right now" is read once at the press rather than on every render.
  const [alertOpen, setAlertOpen] = React.useState<{
    id: string
    openedAt: number
    price: number | null
    /** Opened from the keyboard, so the keyboard should follow it in. */
    autoFocus: boolean
  } | null>(null)
  const [grab, setGrab] = React.useState<Grab | null>(null)
  const lineHold = React.useRef<LineHold | null>(null)
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

  const clearLineHold = React.useCallback(() => {
    const held = lineHold.current
    if (held) clearTimeout(held.timer)
    lineHold.current = null
  }, [])

  React.useEffect(() => clearLineHold, [clearLineHold])

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
  ): ScreenPoint | null => {
    // A press with a tool in hand is meant for the sheet above — it is drawing
    // a new line, not taking hold of the one that happens to be under it.
    if (tool) return null
    const at = pointerReading(event, true)?.point
    const from = localPoint(event)
    if (!at || !from) return null
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
    return from
  }

  /**
   * A press on the line itself, which is also where the touch hold that opens
   * the line's window starts. The line is looked up from the element the
   * press landed on so this stays one function for every line, rather than a
   * new one per line on every render.
   */
  const beginBodyGrab = (event: React.PointerEvent<SVGElement>) => {
    const id = event.currentTarget.getAttribute("data-drawing-id")
    const drawing = drawings.find((candidate) => candidate.id === id)
    if (!drawing) return
    const from = beginGrab(event, drawing, "body")
    if (!from) return
    if (event.pointerType !== "touch" || event.isPrimary === false) return
    // A finger resting on the line opens its window, the way a finger resting
    // on the chart opens the order menu. Kept from reaching the chart, so the
    // same press cannot start that hold as well and open both.
    event.stopPropagation()
    startLineHold(event, drawing.id, from)
  }

  const startLineHold = (
    event: React.PointerEvent<SVGElement>,
    id: string,
    from: ScreenPoint
  ) => {
    clearLineHold()
    if (!onSetAlert) return
    const target = event.currentTarget
    const pointerId = event.pointerId
    const hold: LineHold = {
      id,
      pointerId,
      target,
      from,
      // Reaching here means the finger neither moved nor lifted: every one
      // of those clears the hold first. So the line is still under it,
      // unmoved, and letting the grab go stops the lift saving a move.
      timer: setTimeout(() => {
        if (lineHold.current !== hold) return
        lineHold.current = null
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId)
        }
        setGrab(null)
        setSnapTip(null)
        openAlert(id, false)
      }, TOUCH_HOLD_MS),
    }
    lineHold.current = hold
  }

  const continueGrab = (event: React.PointerEvent<SVGElement>) => {
    if (!grab) return
    const canSnap = grab.original.kind === "level" || grab.part !== "body"
    const reading = pointerReading(event, !canSnap || event.altKey || altHeld)
    if (!reading) return
    const held = lineHold.current
    if (held && movedPast(reading.local, held.from, TOUCH_HOLD_SLOP)) {
      clearLineHold()
    }
    if (!grab.moved && !apart(reading.local, grab.from)) return
    const shape =
      reading.snap && grab.original.kind === "level"
        ? { kind: "level" as const, price: reading.snap.price }
        : dragged(grab, reading.point)
    setSnapTip(reading.snap)
    setGrab({ ...grab, shape, moved: true })
  }

  const endGrab = (event: React.PointerEvent<SVGElement>) => {
    clearLineHold()
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
    (id: string, autoFocus: boolean) => {
      onSelect(id)
      onAlertOpen?.()
      setAlertOpen({
        id,
        openedAt: Date.now(),
        price: currentPrice(),
        autoFocus,
      })
    },
    [onSelect, onAlertOpen, currentPrice]
  )

  /**
   * Close the window and put the keyboard back on the line it belonged to,
   * so Escape lands where Tab left off rather than at the top of the page.
   */
  const closeAlertWindow = (open: boolean) => {
    if (open) return
    const id = alertOpen?.id
    setAlertOpen(null)
    if (id === undefined) return
    // Matched rather than looked up by a selector built from the id: an id is
    // only bounded in length on the way in, and a stray quote in one would
    // throw here and leave the keyboard nowhere.
    const lines = svgRef.current?.querySelectorAll<SVGElement>("[data-drawing-id]")
    for (const line of lines ?? []) {
      if (line.getAttribute("data-drawing-id") === id) {
        line.focus()
        return
      }
    }
  }

  // A line that has gone, or a chart that lost its alerts, closes the window
  // during the same render rather than leaving it hanging over nothing.
  const alertDrawing =
    onSetAlert && alertOpen
      ? (drawings.find((drawing) => drawing.id === alertOpen.id) ?? null)
      : null
  if (alertOpen && !alertDrawing) setAlertOpen(null)

  // ----- Drawing a new one ----------------------------------------------

  // Every new trendline starts the way the last Continuous line switch was
  // left. Only written when on, so a line drawn plain looks as it always did.
  const newTrendline = (
    from: DrawingPoint,
    to: DrawingPoint
  ): DrawingShape => ({
    kind: "trendline",
    from,
    to,
    ...(extendNewLines ? { extendRight: true } : {}),
  })

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
      onCreate(newTrendline(pending.from, reading.point))
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
      onCreate(newTrendline(pending.from, reading.point))
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
        const armed = drawingAlertArmed(drawing.alert)
        const firedAt = fireMarkOf(drawing, surface)
        const label = labelAnchor(segment)
        // One column under the line's end holds every mark it carries: the
        // bell nearest the line, then the cog, then the x. The buttons hide
        // while a tool is in hand, where the sheet above would swallow the
        // click anyway.
        const showButtons = selected && !tool
        const withCog = onSetAlert !== undefined
        const marks = markColumn(
          segment,
          surface,
          (armed ? 1 : 0) + (showButtons ? (withCog ? 2 : 1) : 0)
        ).points
        const bellAt = armed ? marks[0] : null
        const cogAt = showButtons && withCog ? marks[armed ? 1 : 0] : null
        const removeAt = showButtons ? marks[marks.length - 1] : null
        const name = describeDrawingInline(shape, formatPrice)

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
              data-drawing-id={drawing.id}
              aria-label={describeDrawing(shape, formatPrice)}
              onFocus={() => onSelect(drawing.id)}
              onPointerDown={beginBodyGrab}
              onPointerMove={continueGrab}
              onPointerUp={endGrab}
              onPointerCancel={endGrab}
              // The second click of a double-click is a press that never
              // travelled, so no drag starts; and a tool in hand means the
              // sheet above has the pointer, so this never arrives then.
              onDoubleClick={
                onSetAlert ? () => openAlert(drawing.id, false) : undefined
              }
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault()
                  onDelete(drawing.id)
                }
                // Enter and Space are the keyboard's double-click. Only on
                // a watched chart, where the window exists to open.
                if ((event.key === "Enter" || event.key === " ") && onSetAlert) {
                  event.preventDefault()
                  openAlert(drawing.id, true)
                }
              }}
            />
            {/* The name, at the line's start, in the line's own colour. It
                takes no pointer, and a screen reader already hears it in the
                line's own label. */}
            {shape.name ? (
              <text
                data-line-description
                aria-hidden
                // Turned with the line and measured from it, so the words sit
                // along the line rather than lying flat beside it. Five pixels
                // clear of the stroke, whichever way the line leans.
                transform={`translate(${label.x} ${label.y}) rotate(${label.angle})`}
                x={6}
                y={-5}
                fontSize={11}
                fill="currentColor"
                paintOrder="stroke"
                className="stroke-background"
                strokeWidth={3}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {shape.name}
              </text>
            ) : null}
            {/* A bell on every armed line, picked out or not, so which lines
                are watched can be read off the chart. */}
            {bellAt ? <ArmedBell at={bellAt} /> : null}
            {/* Where the price crossed, kept until the alert is switched on
                again or the line goes. */}
            {firedAt ? (
              <circle
                data-line-fired
                aria-hidden
                cx={firedAt.x}
                cy={firedAt.y}
                r={3.5}
                className="fill-primary stroke-background"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
            ) : null}
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
            {cogAt ? (
              <AlertButton
                at={cogAt}
                label={`Alert on ${name}`}
                onOpen={() => openAlert(drawing.id, false)}
              />
            ) : null}
            {/* The picked-out line's own way out, for a mouse. The toolbar's
                bin clears the whole chart, and Delete only reaches a line the
                keyboard is on, so without this there is no way to throw away
                one line with the pointer. */}
            {removeAt ? (
              <RemoveButton
                at={removeAt}
                label={`Delete ${name}`}
                onRemove={() => onDelete(drawing.id)}
              />
            ) : null}
          </g>
        )
      })}

      {alertDrawing && alertOpen && onSetAlert
        ? (() => {
            const segment = segmentOf(alertDrawing.shape, surface)
            // Hung off the foot of a full column, whether or not the line is
            // armed, so switching the alert on does not slide the window it
            // was switched from.
            const column = segment ? markColumn(segment, surface, 3) : null
            const foot = column?.points.at(-1)
            const at = foot
              ? {
                  x: foot.x,
                  y: foot.y + (column?.down ? MARK_RADIUS : -MARK_RADIUS),
                }
              : { x: surface.width / 2, y: surface.height / 2 }
            return (
              <LineAlertPopover
                drawing={alertDrawing}
                linePrice={priceAtTime(alertDrawing.shape, alertOpen.openedAt)}
                currentPrice={alertOpen.price}
                svg={svgRef}
                at={at}
                open={true}
                wide={wide}
                autoFocus={alertOpen.autoFocus}
                paused={lineAlertsPaused}
                onOpenChange={closeAlertWindow}
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
                  onExtendPreference?.(on)
                }}
                // The name rides on the shape, so it is saved the same way.
                onSetName={(name) =>
                  onMove(
                    alertDrawing.id,
                    namedShape(alertDrawing.shape, name),
                    currentPrice()
                  )
                }
                onSetBuffer={(buffer) =>
                  onSetBuffer?.(alertDrawing.id, buffer)
                }
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
