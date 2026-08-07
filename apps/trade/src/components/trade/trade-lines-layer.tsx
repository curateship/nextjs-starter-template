import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import { formatPrice, formatSignedUsd } from "@/lib/trade/format"
import {
  liquidationPx,
  projectedProfit,
  type PaperOrder,
  type PaperPosition,
} from "@/lib/trade/paper"

/**
 * What you are holding, drawn over the candles.
 *
 * Five kinds of line, and they answer five different questions at a glance:
 * where you got in, where you get out with a profit, where you get out with a
 * loss, where the exchange takes the trade off you, and where anything still
 * waiting sits. The two you can change — the target and the stop — and any
 * waiting order can be dragged to a new price or thrown away with the ×.
 *
 * Built the same way as the paint tools rather than as chart price lines: SVG
 * elements over the plot, so every line is something the Tab key can reach and
 * a screen reader can read out. The entry and the liquidation are markers, not
 * controls, so they stay out of the pointer's way entirely.
 *
 * Every wallet holding this market is drawn, not only the one being traded
 * with — clicking a row in the table below takes you to its market, and
 * finding a bare chart there would make the row a dead end. When more than one
 * wallet is in the same market each line says whose it is, and dragging one
 * changes that wallet's order rather than the active wallet's.
 */

/** How far the pointer must travel before a press counts as a drag. */
const DRAG_SLOP = 3

/** Which line is being held, and where it has been dragged to. */
type Grab = {
  id: string
  fromY: number
  price: number
  moved: boolean
}

type LineKind = "entry" | "take_profit" | "stop_loss" | "liquidation" | "order"

type Line = {
  id: string
  kind: LineKind
  price: number
  /**
   * What the line says at a given price — a function, not a string, because a
   * target being dragged has to show what it would pay *where it is now*. Read
   * from the stored price it would be a beat behind the hand moving it.
   */
  label: (price: number) => string
  /** Dragging it re-prices the thing behind it. */
  onMove?: (price: number) => void
  /** The × throws it away. */
  onRemove?: () => void
}

/**
 * One colour per kind, used for the line, its label and its price badge alike.
 * Fixed colours rather than theme tokens on purpose: these mean the same thing
 * on a dark chart as on a light one, and the label sits on the colour itself
 * with white text, so it has to stay dark enough to read against.
 */
const COLOR: Record<LineKind, string> = {
  entry: "#2962ff",
  take_profit: "#089981",
  stop_loss: "#f23645",
  liquidation: "#f59e0b",
  order: "#6b7280",
}

const DASHED: Record<LineKind, string | undefined> = {
  entry: undefined,
  take_profit: "6 4",
  stop_loss: "6 4",
  liquidation: "2 4",
  order: "5 4",
}

/** How tall a label pill and its price badge are. */
const PILL_HEIGHT = 20
/** Roughly how wide the label text runs, for sizing its pill. */
const CHAR_WIDTH = 6.4
/** The × sits inside the pill, to the right of the words. */
const CLOSE_WIDTH = 16

/**
 * The label pill: rounded on its left, square on its right.
 *
 * Square on the right because it butts straight up against the price badge on
 * the axis — a rounded corner there leaves a notch of chart showing between
 * the two, and they are meant to read as one continuous label.
 */
function pillPath(x: number, y: number, width: number, height: number): string {
  const r = 4
  return [
    `M${x + r} ${y}`,
    `H${x + width}`,
    `V${y + height}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
  ].join(" ")
}

export function TradeLinesLayer({
  surface,
  marketKey,
  positions,
  orders,
  walletName,
  tool,
  onMoveOrder,
  onCancelOrder,
  onSetBrackets,
  onSurface,
}: {
  surface: ChartSurface
  /** The market on screen — lines from other markets are not drawn here. */
  marketKey: string | null
  positions: readonly PaperPosition[]
  orders: readonly PaperOrder[]
  /** Names a wallet, for when this market holds more than one wallet's lines. */
  walletName: (walletId: string) => string
  /**
   * A drawing tool in hand. These lines sit above the paint layer, so while a
   * tool is held they stop taking the pointer entirely — a press near a stop
   * is meant for the line being drawn, not for the stop.
   */
  tool: string | null
  onMoveOrder: (walletId: string, orderId: string, price: number) => void
  onCancelOrder: (walletId: string, orderId: string) => void
  onSetBrackets: (
    walletId: string,
    marketKey: string,
    brackets: { tpPx: number | null; slPx: number | null }
  ) => void
  /**
   * Hands the chart's coordinates back up, so a right-click anywhere on the
   * chart can be turned into the price it landed on. Reported from here rather
   * than read out of the chart during its own render, which is the one moment
   * the panel above is not allowed to touch.
   */
  onSurface?: (surface: ChartSurface) => void
}) {
  const [grab, setGrab] = React.useState<Grab | null>(null)

  React.useEffect(() => {
    onSurface?.(surface)
  }, [surface, onSurface])

  const held = positions.filter((one) => one.marketKey === marketKey)
  const waiting = orders.filter((one) => one.marketKey === marketKey)

  // More than one wallet in this market means every line has to say which
  // wallet it belongs to, or two entry lines sit there with nothing to tell
  // them apart. With only one wallet involved the name would just be noise.
  const involved = new Set(
    [...held, ...waiting].map((one) => one.walletId)
  )
  const whose = (walletId: string) =>
    involved.size > 1 ? ` · ${walletName(walletId)}` : ""

  const lines: Line[] = []

  for (const position of held) {
    if (!marketKey) break
    const tag = whose(position.walletId)

    lines.push({
      id: `entry:${position.id}`,
      kind: "entry",
      price: position.entryPx,
      label: () => `Entry${tag}`,
    })

    const liq = liquidationPx(position)
    if (liq !== null) {
      lines.push({
        id: `liq:${position.id}`,
        kind: "liquidation",
        price: liq,
        label: () => `Liquidation${tag}`,
      })
    }

    if (position.tpPx !== null) {
      lines.push({
        id: `tp:${position.id}`,
        kind: "take_profit",
        price: position.tpPx,
        // What it would pay at whatever price it is being held at — the
        // number that decides whether the target is where you want it.
        label: (at) =>
          `Take Profit ${formatSignedUsd(projectedProfit(position, at))}${tag}`,
        onMove: (price) =>
          onSetBrackets(position.walletId, marketKey, {
            tpPx: price,
            slPx: position.slPx,
          }),
        onRemove: () =>
          onSetBrackets(position.walletId, marketKey, {
            tpPx: null,
            slPx: position.slPx,
          }),
      })
    }
    if (position.slPx !== null) {
      lines.push({
        id: `sl:${position.id}`,
        kind: "stop_loss",
        price: position.slPx,
        label: (at) =>
          `Stop Loss ${formatSignedUsd(projectedProfit(position, at))}${tag}`,
        onMove: (price) =>
          onSetBrackets(position.walletId, marketKey, {
            tpPx: position.tpPx,
            slPx: price,
          }),
        onRemove: () =>
          onSetBrackets(position.walletId, marketKey, {
            tpPx: position.tpPx,
            slPx: null,
          }),
      })
    }
  }

  for (const order of waiting) {
    lines.push({
      id: `order:${order.id}`,
      kind: "order",
      price: order.px,
      label: () =>
        `${order.side === "buy" ? "Buy" : "Sell"} ${order.sz}${whose(order.walletId)}`,
      onMove: (price) => onMoveOrder(order.walletId, order.id, price),
      onRemove: () => onCancelOrder(order.walletId, order.id),
    })
  }

  const beginGrab = (event: React.PointerEvent<SVGElement>, line: Line) => {
    if (!line.onMove) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!box) return
    setGrab({
      id: line.id,
      fromY: event.clientY - box.top,
      price: line.price,
      moved: false,
    })
  }

  const continueGrab = (event: React.PointerEvent<SVGElement>) => {
    if (!grab) return
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!box) return
    const y = event.clientY - box.top
    if (!grab.moved && Math.abs(y - grab.fromY) <= DRAG_SLOP) return
    const price = surface.priceAt(y)
    if (price === null || price <= 0) return
    setGrab({ ...grab, price, moved: true })
  }

  const endGrab = (event: React.PointerEvent<SVGElement>, line: Line) => {
    if (!grab || grab.id !== line.id) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // A press that never travelled was a press, not a move, and saving a price
    // that did not change would be a write for nothing.
    if (grab.moved) line.onMove?.(grab.price)
    setGrab(null)
  }

  return (
    <svg
      // Marks everything these lines own, so a press anywhere else on the page
      // is plainly not aimed at them.
      data-chart-trade
      // Wider than the plot by the axis, which is where each line's price
      // badge sits. The lines themselves still stop at the plot's edge.
      width={surface.width + surface.axisWidth}
      height={surface.height}
      className="absolute top-0 left-0"
    >
      {lines.map((line) => {
        const price = grab?.id === line.id ? grab.price : line.price
        const y = surface.yOf(price)
        if (y === null) return null
        const held = grab?.id === line.id
        const color = COLOR[line.kind]
        const priceText = formatPrice(price)
        const label = line.label(price)

        // The label pill sits at the right-hand end of the line, tucked
        // against the axis, with its price carrying straight on into the axis
        // itself — so the line, what it is, and what it costs read as one
        // thing left to right instead of three things to hunt for.
        const pillWidth =
          label.length * CHAR_WIDTH + 16 + (line.onRemove ? CLOSE_WIDTH : 0)
        const pillX = Math.max(2, surface.width - pillWidth)
        const top = y - PILL_HEIGHT / 2

        return (
          <g key={line.id}>
            <line
              x1={0}
              y1={y}
              x2={surface.width}
              y2={y}
              stroke={color}
              strokeWidth={held ? 2 : 1.5}
              strokeDasharray={DASHED[line.kind]}
            />

            <g style={{ pointerEvents: "none" }}>
              <path d={pillPath(pillX, top, pillWidth, PILL_HEIGHT)} fill={color} />
              <text
                x={pillX + 8}
                y={y + 3.5}
                fill="#ffffff"
                style={{ fontSize: 11, fontWeight: 500 }}
              >
                {label}
              </text>
              {/* The price runs on into the axis, in the line's own colour, so
                  it reads against the axis numbers the way a mark price does. */}
              <rect
                x={surface.width}
                y={top}
                width={surface.axisWidth}
                height={PILL_HEIGHT}
                fill={color}
              />
              <text
                x={surface.width + 6}
                y={y + 3.5}
                fill="#ffffff"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {priceText.replace("$", "")}
              </text>
            </g>

            {line.onMove && !tool ? (
              // A fat invisible line over the thin visible one, because a
              // 1.5px target is not one.
              <line
                x1={0}
                y1={y}
                x2={surface.width}
                y2={y}
                stroke={color}
                strokeOpacity={0}
                strokeWidth={14}
                style={{
                  pointerEvents: "stroke",
                  cursor: "ns-resize",
                  outline: "none",
                }}
                tabIndex={0}
                role="button"
                aria-label={`${label} at ${priceText}`}
                onPointerDown={(event) => beginGrab(event, line)}
                onPointerMove={continueGrab}
                onPointerUp={(event) => endGrab(event, line)}
                onPointerCancel={(event) => endGrab(event, line)}
                onKeyDown={(event) => {
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault()
                    line.onRemove?.()
                  }
                }}
              />
            ) : null}

            {line.onRemove && !tool ? (
              <RemoveButton
                x={pillX + pillWidth - CLOSE_WIDTH / 2 - 6}
                y={y}
                label={`Remove ${label.toLowerCase()}`}
                onRemove={line.onRemove}
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

/** The × inside a label pill, in the pill's own white. */
function RemoveButton({
  x,
  y,
  label,
  onRemove,
}: {
  x: number
  y: number
  label: string
  onRemove: () => void
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      style={{ pointerEvents: "all", cursor: "pointer", outline: "none" }}
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
      {/* Invisible, only so the × has something finger-sized to be pressed on. */}
      <rect
        x={x - 8}
        y={y - 9}
        width={18}
        height={18}
        fill="transparent"
      />
      <path
        d={`M${x - 3.5} ${y - 3.5} L${x + 3.5} ${y + 3.5} M${x + 3.5} ${y - 3.5} L${x - 3.5} ${y + 3.5}`}
        stroke="#ffffff"
        strokeOpacity={0.85}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>
  )
}
