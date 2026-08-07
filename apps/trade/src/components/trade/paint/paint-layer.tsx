import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import type { PaintTool } from "@/components/trade/paint/use-drawings"
import {
  describeDrawing,
  moveShape,
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
  /** The pointer has been let go and the end is waiting for a second click. */
  anchored: boolean
}

/** Where a press landed, in the layer's own pixels. */
function localPoint(event: React.PointerEvent<SVGElement>): ScreenPoint | null {
  const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
  return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : null
}

/** Far enough apart to have meant a drag rather than a click. */
function apart(a: ScreenPoint, b: ScreenPoint): boolean {
  return Math.abs(a.x - b.x) > DRAG_SLOP || Math.abs(a.y - b.y) > DRAG_SLOP
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
    ? { kind: "trendline", from: now, to: grab.original.to }
    : { kind: "trendline", from: grab.original.from, to: now }
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

/** Where a line's own delete button sits: over its middle, clear of the line. */
function midpointOf(segment: Segment, surface: ChartSurface): ScreenPoint {
  const x = (segment.x1 + segment.x2) / 2
  const y = (segment.y1 + segment.y2) / 2 - 16
  // Kept inside the plot, so a line drawn along the top edge still has a
  // button somebody can reach.
  return {
    x: Math.min(Math.max(x, 12), surface.width - 12),
    y: Math.min(Math.max(y, 12), surface.height - 12),
  }
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
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      style={{ pointerEvents: "all", cursor: "pointer", outline: "none" }}
      className="text-muted-foreground hover:text-destructive focus-visible:text-destructive"
      // On the press, not the click: the line underneath takes hold of the
      // pointer on its own press, and a click would arrive after the drag it
      // started.
      onPointerDown={(event) => {
        event.stopPropagation()
        onRemove()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onRemove()
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
      <path
        d={`M${at.x - 3.5} ${at.y - 3.5} L${at.x + 3.5} ${at.y + 3.5} M${at.x + 3.5} ${at.y - 3.5} L${at.x - 3.5} ${at.y + 3.5}`}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  )
}

export function PaintLayer({
  surface,
  drawings,
  tool,
  selectedId,
  onSelect,
  onCreate,
  onMove,
  onDelete,
}: {
  surface: ChartSurface
  drawings: Drawing[]
  tool: PaintTool | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (shape: DrawingShape) => void
  onMove: (id: string, shape: DrawingShape) => void
  onDelete: (id: string) => void
}) {
  const [grab, setGrab] = React.useState<Grab | null>(null)
  const [hover, setHover] = React.useState<ScreenPoint | null>(null)
  const [pending, setPending] = React.useState<PendingLine | null>(null)

  // Changing tools — including putting one down with Escape, and the tool
  // putting itself down once it has drawn something — takes the half-finished
  // line and the preview with it. Adjusted during the render that brings the
  // change in, so there is no frame with the old preview still on screen.
  const [lastTool, setLastTool] = React.useState(tool)
  if (tool !== lastTool) {
    setLastTool(tool)
    setPending(null)
    setHover(null)
  }

  const marketPoint = (
    event: React.PointerEvent<SVGElement>
  ): DrawingPoint | null => {
    const local = localPoint(event)
    if (!local) return null
    const price = surface.priceAt(local.y)
    return price === null ? null : { time: surface.timeAt(local.x), price }
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
    const at = marketPoint(event)
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
    const now = marketPoint(event)
    const local = localPoint(event)
    if (!now || !local) return
    if (!grab.moved && !apart(local, grab.from)) return
    setGrab({ ...grab, shape: dragged(grab, now), moved: true })
  }

  const endGrab = (event: React.PointerEvent<SVGElement>) => {
    if (!grab) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // A press that never travelled was a click to pick the line out, and
    // saving an unchanged line would be a write for nothing.
    if (grab.moved) onMove(grab.id, grab.shape)
    setGrab(null)
  }

  // ----- Drawing a new one ----------------------------------------------

  const sheetDown = (event: React.PointerEvent<SVGElement>) => {
    if (tool !== "trendline") return
    const point = marketPoint(event)
    if (!point) return
    if (pending?.anchored) {
      onCreate({ kind: "trendline", from: pending.from, to: point })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPending({ from: point, to: point, anchored: false })
  }

  const sheetMove = (event: React.PointerEvent<SVGElement>) => {
    const local = localPoint(event)
    if (local) setHover(local)
    const point = marketPoint(event)
    if (point && pending) setPending({ ...pending, to: point })
  }

  const sheetUp = (event: React.PointerEvent<SVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const point = marketPoint(event)
    const local = localPoint(event)
    if (!point) return

    if (tool === "level") {
      onCreate({ kind: "level", price: point.price })
      return
    }
    if (!pending || pending.anchored) return

    // A drag draws the line in one go; a tap leaves the far end following the
    // pointer until a second tap puts it down, which is the only way there is
    // to draw one on a touchscreen.
    const startY = surface.yOf(pending.from.price)
    const start =
      startY === null ? null : { x: surface.xOf(pending.from.time), y: startY }
    if (!start || !local || apart(local, start)) {
      onCreate({ kind: "trendline", from: pending.from, to: point })
    } else {
      setPending({ ...pending, anchored: true })
    }
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
      ? { x1: 0, y1: hover.y, x2: surface.width, y2: hover.y }
      : null

  return (
    <svg
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

        return (
          <g
            key={drawing.id}
            className={selected ? "text-foreground" : "text-foreground/55"}
          >
            {/* A soft glow along the line itself says it is the picked one.
                The browser's own focus ring is turned off below and this
                stands in for it: a ring draws a box round the whole thing,
                which on a line running corner to corner is a rectangle over
                half the chart. */}
            {selected ? (
              <line
                {...segment}
                stroke="currentColor"
                strokeOpacity={0.18}
                strokeWidth={9}
                strokeLinecap="round"
              />
            ) : null}
            <line
              {...segment}
              stroke="currentColor"
              strokeWidth={selected ? 2 : 1.5}
            />
            {/* The part the pointer and the Tab key actually meet: a fat
                invisible line over the thin visible one, because a 1.5px
                target is not one. Focus picks the line out, so the glow above
                is the focus mark too — one thing to look for whether the line
                was clicked or tabbed to. */}
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
            {/* The picked-out line's own way out, for a mouse. The rail's bin
                clears the whole chart, and Delete only reaches a line the
                keyboard is on, so without this there is no way to throw away
                one line with the pointer. It hides while a tool is in hand,
                where the sheet above would swallow the click anyway. */}
            {selected && !tool ? (
              <RemoveButton
                at={midpointOf(segment, surface)}
                label={`Delete ${describeDrawing(shape, formatPrice).toLowerCase()}`}
                onRemove={() => onDelete(drawing.id)}
              />
            ) : null}
          </g>
        )
      })}

      {preview ? (
        <line
          {...preview}
          className="text-foreground/70"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 4"
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
          style={{ pointerEvents: "all", cursor: "crosshair" }}
          onPointerDown={sheetDown}
          onPointerMove={sheetMove}
          onPointerUp={sheetUp}
          onPointerLeave={() => setHover(null)}
        />
      ) : null}
    </svg>
  )
}
