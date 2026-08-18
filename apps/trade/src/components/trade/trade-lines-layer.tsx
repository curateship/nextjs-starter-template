import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import {
  formatPrice,
  formatSignedUsd,
  formatUsdRounded,
} from "@/lib/trade/format"
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
 * waiting order can be dragged to a new price, opened for editing by pressing
 * its bar, or thrown away with the ×.
 *
 * A waiting order carries its own target and stop, drawn in a finer dash than
 * a live one's. They are where the trade will get out once the order fills,
 * which is a different fact from where a trade already open gets out — so they
 * are drawn but not draggable. The bar opens the window that changes them.
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

type LineKind =
  | "entry"
  | "take_profit"
  | "stop_loss"
  | "liquidation"
  | "order"
  /** A waiting order's own target and stop — where it will get out, not where it is. */
  | "order_take_profit"
  | "order_stop_loss"

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
  /** The ⚙ opens whatever settings the thing behind it has. */
  onSettings?: () => void
  /** Words that belong on hover, not in the pill. */
  hint?: string
}

/**
 * Something riding on a position that wants to live in its entry pill — the
 * DCA ladder folds itself in as "Entry · 4 ⚙ ×": the count and the controls,
 * with the words in the hover tooltip instead of the bar.
 */
export type EntryBadge = {
  /** As short as possible — a count, not a sentence. */
  text: string
  /** The sentence, shown on hover. */
  hint: string
  onSettings: () => void
  /** Null when there is nothing left to call off. */
  onRemove: (() => void) | null
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
  order_take_profit: "#089981",
  order_stop_loss: "#f23645",
}

/** A finer dash on the two that have not started yet — they are a plan, not a fact. */
const DASHED: Record<LineKind, string | undefined> = {
  entry: undefined,
  take_profit: "6 4",
  stop_loss: "6 4",
  liquidation: "2 4",
  order: "5 4",
  order_take_profit: "2 3",
  order_stop_loss: "2 3",
}

/** How tall a label pill and its price badge are. */
const PILL_HEIGHT = 22
/** Roughly how wide the label text runs, for sizing its pill. */
const CHAR_WIDTH = 6.4
/** The × sits inside the pill, to the right of the words. */
const CLOSE_WIDTH = 16
/** The grip's dots, and the room they take at the pill's left edge. */
const GRIP_WIDTH = 14
/** The gap between the pill and the price badge that follows it. */
const BADGE_GAP = 4
/** How round both the pill and the price badge are. */
const PILL_RADIUS = 8

/**
 * The grip: two columns of three dots, drawn only where a line can be dragged.
 *
 * **It is the one thing that says a line moves.** A dashed line with a label
 * looks exactly like a line you can only read, and somebody who does not know
 * a stop can be dragged has no way to find out. The dots are the same handle
 * every draggable thing in this app uses, so they read without a legend.
 */
function Grip({ x, y, color }: { x: number; y: number; color: string }) {
  const dots: React.ReactNode[] = []
  for (let column = 0; column < 2; column++) {
    for (let row = 0; row < 3; row++) {
      dots.push(
        <circle
          key={`${column}-${row}`}
          cx={x + column * 4}
          cy={y + row * 4}
          r={1.1}
          fill={color}
        />
      )
    }
  }
  return <g opacity={0.75}>{dots}</g>
}

export function TradeLinesLayer({
  surface,
  marketKey,
  positions,
  orders,
  walletName,
  tool,
  entryBadge,
  onMoveOrder,
  onMoveOrderStop,
  onMoveOrderTarget,
  onCancelOrder,
  onEditOrder,
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
  /** What a position's entry pill carries besides "Entry", if anything. */
  entryBadge?: (position: PaperPosition) => EntryBadge | null
  onMoveOrder: (walletId: string, orderId: string, price: number) => void
  /**
   * Dragging a waiting order's stop, which changes how much the order is for.
   *
   * The money at stake stays where it was put: a stop dragged twice as far
   * halves the order rather than doubling what it can lose. That is the whole
   * reason this line is draggable at all — see `resizeForStop`.
   */
  onMoveOrderStop?: (walletId: string, orderId: string, price: number) => void
  /** Dragging a waiting order's target. The amount is left alone. */
  onMoveOrderTarget?: (walletId: string, orderId: string, price: number) => void
  onCancelOrder: (walletId: string, orderId: string) => void
  /**
   * Pressing a waiting order's bar: its size and where it gets out. Only the
   * order's id — the window reads the row itself, which carries its wallet.
   */
  onEditOrder?: (orderId: string) => void
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
    const badge = entryBadge?.(position) ?? null

    lines.push({
      id: `entry:${position.id}`,
      kind: "entry",
      price: position.entryPx,
      label: () => `Entry${tag}${badge ? ` · ${badge.text}` : ""}`,
      hint: badge?.hint,
      onSettings: badge?.onSettings,
      onRemove: badge?.onRemove ?? undefined,
    })

    // A real position's liquidation price is the exchange's own answer; the
    // formula is for practice positions, where this app IS the exchange.
    const liq = position.live ? position.live.liquidationPx : liquidationPx(position)
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
    const tag = whose(order.walletId)
    // An order still on its way to the server has no id anything could act on,
    // so it is drawn and nothing more. It says so rather than looking stuck.
    const settled = !order.placing
    // The trade this order would open, for working out what its own target and
    // stop would pay. It is not held yet — this is what it would be.
    const wouldHold = {
      szi: order.side === "buy" ? order.sz : -order.sz,
      entryPx: order.px,
    }
    // A real resting order can neither be dragged to a new price nor changed
    // in place yet — both are the edit-orders task. Its × still cancels.
    const edit =
      settled && !order.live && !order.watched && onEditOrder
        ? () => onEditOrder(order.id)
        : undefined

    lines.push({
      id: `order:${order.id}`,
      kind: "order",
      price: order.px,
      // In dollars, not in coins. "Buy 3.2754" is an amount of something whose
      // price is the other number on the same line; the money it commits is
      // the figure anybody reads a resting order for, and it is the one that
      // compares with every other order on the chart.
      label: () =>
        `${order.side === "buy" ? "Buy" : "Sell"} ${formatUsdRounded(
          order.px * order.sz
        )}${tag}${settled ? "" : " · sending"}`,
      onMove:
        settled && !order.live && !order.watched
          ? (price) => onMoveOrder(order.walletId, order.id, price)
          : undefined,
      onRemove: settled
        ? () => onCancelOrder(order.walletId, order.id)
        : undefined,
      onSettings: edit,
      hint: edit
        ? "Change how much this order is for, and where it gets out once it fills."
        : undefined,
    })

    if (order.tpPx !== null) {
      // Moving the target changes where the trade gets out in profit and
      // nothing else — the amount stays where it was put, because the target
      // has no say in what the trade can lose.
      const move =
        settled && !order.live && !order.watched && onMoveOrderTarget
          ? (price: number) => onMoveOrderTarget(order.walletId, order.id, price)
          : undefined
      lines.push({
        id: `order-tp:${order.id}`,
        kind: "order_take_profit",
        price: order.tpPx,
        label: (at) =>
          `Take Profit ${formatSignedUsd(projectedProfit(wouldHold, at))}${tag}`,
        onMove: move,
        hint: move ? "Drag to move where this order takes its profit." : undefined,
      })
    }
    if (order.slPx !== null) {
      // Draggable only on a practice order, exactly like the order's own price
      // line above: a real resting order cannot be changed in place, it has to
      // be cancelled and placed again.
      const resize =
        settled && !order.live && !order.watched && onMoveOrderStop
          ? (price: number) => onMoveOrderStop(order.walletId, order.id, price)
          : undefined
      lines.push({
        id: `order-sl:${order.id}`,
        kind: "order_stop_loss",
        price: order.slPx,
        label: (at) =>
          `Stop Loss ${formatSignedUsd(projectedProfit(wouldHold, at))}${tag}`,
        onMove: resize,
        hint: resize
          ? "Drag to move the stop. The order's size changes with it, so it still risks the same money."
          : undefined,
      })
    }
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

        // Line, then an outlined pill saying what it is, then the price in a
        // solid badge over the axis. The words sit in the line's own colour on
        // the chart's background rather than in white on a block of it: a
        // solid bar that wide reads as a thing in its own right and hides the
        // candles behind it, while the price — the one figure that has to be
        // found at a glance — keeps the colour to itself.
        const grip = line.onMove ? GRIP_WIDTH : 0
        // 20 of padding, plus room for the grip and for whichever controls the
        // line carries — with a gap of its own before them, so the words never
        // butt straight up against the gear.
        const controls =
          (line.onRemove ? CLOSE_WIDTH : 0) + (line.onSettings ? CLOSE_WIDTH : 0)
        const pillWidth =
          label.length * CHAR_WIDTH +
          20 +
          grip +
          (controls > 0 ? controls + 4 : 0)
        const badgeWidth = Math.max(
          surface.axisWidth,
          priceText.length * CHAR_WIDTH + 12
        )
        const pillX = Math.max(2, surface.width - pillWidth - BADGE_GAP)
        const top = y - PILL_HEIGHT / 2

        return (
          <g key={line.id}>
            {/* Stops at the pill rather than running under it, so the words
                are read against the chart and not against their own line. */}
            <line
              x1={0}
              y1={y}
              x2={Math.max(0, pillX - 2)}
              y2={y}
              stroke={color}
              strokeWidth={held ? 2 : 1.5}
              strokeDasharray={DASHED[line.kind]}
            />

            <g style={{ pointerEvents: "none" }}>
              <rect
                x={pillX}
                y={top}
                width={pillWidth}
                height={PILL_HEIGHT}
                rx={PILL_RADIUS}
                fill="var(--card)"
                fillOpacity={0.92}
                stroke={color}
                strokeWidth={held ? 1.75 : 1.25}
              />
              {line.onMove ? (
                <Grip x={pillX + 9} y={y - 4} color={color} />
              ) : null}
              <text
                x={pillX + 10 + grip}
                y={y + 4}
                fill={color}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                }}
              >
                {label}
              </text>
              {/* The price in the line's colour, over the axis, where every
                  other price on the chart is read. */}
              <rect
                x={surface.width + BADGE_GAP}
                y={top}
                width={badgeWidth}
                height={PILL_HEIGHT}
                rx={PILL_RADIUS}
                fill={color}
              />
              <text
                x={surface.width + BADGE_GAP + 6}
                y={y + 4}
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

            {line.onSettings && !tool ? (
              // The whole pill is the press target, not just the little gear —
              // the gear stays as the visual cue, the × on top still wins.
              //
              // **It opens on the release, and only if the pointer stayed
              // put.** The pill sits on the line, so a press on it that then
              // moves is somebody dragging the order to a new price; opening
              // on the press meant the window jumped up the moment they took
              // hold of it, and the drag never happened. A press that travels
              // drags, a press that does not opens the window.
              <g
                role="button"
                tabIndex={0}
                aria-label={line.hint ?? `Settings for ${label.toLowerCase()}`}
                style={{
                  pointerEvents: "all",
                  cursor: line.onMove ? "ns-resize" : "pointer",
                  outline: "none",
                }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  if (line.onMove) beginGrab(event, line)
                }}
                onPointerMove={continueGrab}
                onPointerUp={(event) => {
                  const dragged = grab?.id === line.id && grab.moved
                  endGrab(event, line)
                  if (!dragged) line.onSettings?.()
                }}
                onPointerCancel={(event) => endGrab(event, line)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    line.onSettings?.()
                  }
                }}
              >
                {line.hint ? <title>{line.hint}</title> : null}
                <rect
                  x={pillX}
                  y={top}
                  width={pillWidth}
                  height={PILL_HEIGHT}
                  rx={PILL_RADIUS}
                  fill="transparent"
                />
              </g>
            ) : null}

            {line.onSettings ? (
              // Just the glyph — the whole pill above is the press target, so
              // a second button here would only fight it for the pointer.
              <text
                x={
                  pillX +
                  pillWidth -
                  (line.onRemove ? CLOSE_WIDTH : 0) -
                  CLOSE_WIDTH / 2 -
                  6
                }
                y={y + 5}
                textAnchor="middle"
                fill={color}
                fillOpacity={0.9}
                style={{ fontSize: 15, pointerEvents: "none" }}
              >
                ⚙
              </text>
            ) : null}

            {line.onRemove && !tool ? (
              <RemoveButton
                x={pillX + pillWidth - CLOSE_WIDTH / 2 - 6}
                y={y}
                color={color}
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

/** The × inside a label pill, in the line's own colour. */
function RemoveButton({
  x,
  y,
  color,
  label,
  onRemove,
}: {
  x: number
  y: number
  color: string
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
        stroke={color}
        strokeOpacity={0.9}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>
  )
}
