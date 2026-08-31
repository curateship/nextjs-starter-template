import * as React from "react"
import {
  ArrowUpDownIcon,
  GripVerticalIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import type { GridPreview } from "@/components/trade/grid-order-dialog"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { ChartColors } from "@/lib/trade/chart-theme"
import {
  formatPrice,
  formatSignedUsd,
  formatUsdRounded,
} from "@/lib/trade/format"
import {
  entrySide,
  exitSide,
  gridEndAfterRangeMove,
  gridLevels,
  gridRangeAfterMove,
  gridRangeEndMovable,
  gridStopBeyond,
  gridStopPx,
  gridTakeProfitPx,
  lossEdge,
  GRID_DIRECTION_LABELS,
  type GridDirection,
} from "@/lib/trade/grid"
import type { SmartGrid } from "@/lib/trade/smart-plan"
import { cn } from "@/lib/utils"

/**
 * A placed grid, drawn over the candles — and, while the placement window is
 * open, the faint preview of the one being set up.
 *
 * The levels are drawn from the grid's own record rather than from the order
 * rows, because not every level has an order: one under the stop is alive but
 * off the book, and one holding coins has a sell out instead of a buy. Each
 * state says what it is, and a waiting level's × calls just that level off —
 * permanently, which is the one thing here that does not come back.
 *
 * A flat grid can move freely. With one level open, the outer lines compress
 * or expand the waiting prices around that fixed entry.
 */

export const GridLayer = React.memo(function GridLayer({
  surface,
  colors,
  marketKey,
  currentPx,
  grids,
  preview,
  tool,
  walletName,
  feesPaidFor,
  onCancelLevel,
  onCancelGrid,
  onOpenSettings,
  onReverseGrid,
  reverseDisabledReason,
  onMoveRange,
  onMoveExit,
}: {
  surface: ChartSurface
  colors: ChartColors
  marketKey: string | null
  /** Today's price, used when a hand moves a range that began below it. */
  currentPx: number | null
  /** Every live grid, whichever wallet holds it; this market's are drawn. */
  grids: readonly SmartGrid[]
  /** The placement window's levels as edited, or null when it is shut. */
  preview: GridPreview | null
  /** A paint tool in hand takes the pointer; these controls step aside. */
  tool: string | null
  walletName: (walletId: string) => string
  /** Opening fees still attached to held levels, or null when fills are short. */
  feesPaidFor?: (grid: SmartGrid) => number | null
  onCancelLevel: (walletId: string, gridId: string, levelIndex: number) => void
  onCancelGrid: (grid: SmartGrid) => void
  onOpenSettings: (grid: SmartGrid, anchor: HTMLElement) => void
  /** Opens the reversal confirmation for this grid. */
  onReverseGrid: (grid: SmartGrid) => void
  /** Why this grid cannot be reversed right now, or null when it can. */
  reverseDisabledReason: (grid: SmartGrid) => string | null
  onMoveRange: (
    grid: SmartGrid,
    move: { end: "top" | "bottom"; px: number }
  ) => Promise<boolean>
  onMoveExit: (
    grid: SmartGrid,
    which: "takeProfit" | "stopLoss",
    px: number
  ) => Promise<boolean>
}) {
  const shown = grids.filter((grid) => grid.marketKey === marketKey)

  const yFor = (price: number): number | null => {
    const y = surface.yOf(price)
    if (y === null || y < 0 || y > surface.height) return null
    return y
  }

  // The same, but kept on screen, and saying whether it had to be moved.
  //
  // The range is the whole point of a grid, so an end of it that has scrolled
  // out of view must not simply vanish — it is pinned to the edge of the chart
  // with an arrow instead. A grid whose bottom you cannot see is a grid you
  // cannot check, and the chart is often zoomed far tighter than the range.
  const yPinned = (
    price: number
  ): { y: number; off: "above" | "below" | null } | null => {
    const y = surface.yOf(price)
    if (y === null) return null
    if (y < 0) return { y: 0, off: "above" }
    if (y > surface.height) return { y: surface.height, off: "below" }
    return { y, off: null }
  }

  // The preview's own band: from its highest line to its lowest.
  const previewBand = (() => {
    if (!preview || preview.lines.length === 0) return null
    const inRange = preview.lines.filter(
      (one) =>
        one.kind === "upper" || one.kind === "lower" || one.kind === "level"
    )
    if (inRange.length === 0) return null
    const top = yPinned(Math.max(...inRange.map((one) => one.px)))
    const bottom = yPinned(Math.min(...inRange.map((one) => one.px)))
    if (!top || !bottom || bottom.y <= top.y) return null
    return { top: top.y, height: bottom.y - top.y }
  })()

  // The layer's own box is the frame every price on it is measured against,
  // so a drag reads it rather than guessing at a parent — a guess that is
  // wrong by a header's height turns "move the top" into a price nobody
  // pointed at.
  const layerRef = React.useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={layerRef}
      className="absolute inset-0"
      style={{ pointerEvents: "none", width: surface.width }}
    >
      {/* The grid being set up, drawn the way a placed one is drawn, so the
          window is a picture of the result rather than a guess at it. */}
      {previewBand ? (
        <div
          className="absolute inset-x-0"
          style={{
            top: previewBand.top,
            height: previewBand.height,
            backgroundColor: colors.primary,
            opacity: 0.05,
          }}
        />
      ) : null}
      {preview?.lines.map((line, index) => {
        const y = yFor(line.px)
        if (y === null) return null
        const look = lineLook(
          line.kind,
          colors,
          preview.direction,
          preview.levelCount
        )
        return (
          <ChartLine
            key={`grid-preview-${index}`}
            y={y}
            colour={look.colour}
            name={look.name}
            dashed={look.dashed}
            faded
          />
        )
      })}

      {shown.map((grid) => (
        <GridLines
          key={grid.id}
          grid={grid}
          currentPx={currentPx}
          colors={colors}
          yFor={yFor}
          yPinned={yPinned}
          tool={tool}
          walletName={walletName}
          feesPaid={feesPaidFor ? feesPaidFor(grid) : 0}
          onCancelLevel={onCancelLevel}
          onCancelGrid={onCancelGrid}
          onOpenSettings={onOpenSettings}
          onReverseGrid={onReverseGrid}
          reverseDisabledReason={reverseDisabledReason}
          onMoveRange={onMoveRange}
          onMoveExit={onMoveExit}
          // Split in two so a drag measures the layer's box ONCE, when it
          // starts, instead of asking the browser to lay out on every pixel
          // of movement. The box cannot move mid-drag — nothing scrolls or
          // resizes while a pointer is held on a chart line.
          measureTop={() =>
            layerRef.current?.getBoundingClientRect().top ?? null
          }
          priceFrom={(clientY, top) => surface.priceAt(clientY - top)}
        />
      ))}
    </div>
  )
})

/**
 * What rests at one price, and which level it belongs to.
 *
 * A price is a place, not a level. On an evenly spread grid a level's EXIT
 * price is the next level's ENTRY price, so drawing a line for each of them
 * puts two lines and two labels on top of each other at every price in the
 * middle of the range. Worse, both really can be resting at once — one level
 * holding and closing here, the next waiting and opening here — so it is not a
 * duplicate to hide, it is two orders at one price that have to be said in one
 * label.
 */
type AtPrice = {
  px: number
  /** The waiting level that opens here, by index, or null. */
  entry: number | null
  holding: number | null
  carried: boolean
  dead: boolean
  /** This price is also an end of the range, so its label says so. */
  edge: "top" | "bottom" | null
  /**
   * What this level puts in, in dollars.
   *
   * The price is what the level is; this is what it costs, and it is the
   * figure anybody reads a grid for — a dozen levels at a price each is
   * twelve numbers that cannot be added up in your head.
   */
  usd: number
}

/** Prices from the same arithmetic, keyed so they group rather than near-miss. */
function priceKey(px: number): string {
  return px.toPrecision(12)
}

/**
 * What one end of the range says on hover.
 *
 * One of the two ends carries the deepest level's own price and the other is
 * only where that level's way out sits. Which is which depends on the
 * direction, so the sentence has to as well.
 */
function edgeTitle(
  direction: GridDirection,
  end: "top" | "bottom",
  level: AtPrice | null,
  movable: boolean
): string {
  const where = end === "top" ? "top" : "bottom"
  if (level === null) {
    return movable
      ? `Drag to move the ${where} of the range. If one entry is open, its price stays fixed while the other prices spread out or pull in.`
      : `The ${where} of the range. It is fixed because more than one entry is open, or an older range still holds coin.`
  }
  if (level.holding !== null) {
    return `The ${where} of the range is an open entry, so it stays fixed. Drag the other edge instead.`
  }
  return movable
    ? `The ${where} of the range, and its deepest ${entrySide(direction)}. Drag to move it.`
    : `The ${where} of the range, and its deepest ${entrySide(direction)}. It is fixed because more than one entry is open, or an older range still holds coin.`
}

/** What one level line says on hover, in the words of the grid it belongs to. */
function levelTitle(
  direction: GridDirection,
  at: AtPrice,
  holding: boolean
): string {
  const price = formatPrice(at.px)
  const opens = entrySide(direction)
  const closes = exitSide(direction)
  // Where this level's way out sits: one step up on a buying grid, one step
  // down on a selling one.
  const exitWay = direction === "long" ? "above" : "below"
  if (at.dead) {
    return `Past your stop — it cannot ${opens} without the stop firing first. It wakes up if the stop moves clear of it.`
  }
  if (at.carried) {
    return `This level belongs to an older range. It keeps its original ${closes} and finishes when that trade fills.`
  }
  if (holding) {
    return `Opened at ${price}. When its ${closes} one step ${exitWay} fills, a ${opens} goes back on here.`
  }
  return `Waiting to ${opens} ${price}. When it fills, a ${closes} goes on one step ${exitWay} — and when THAT fills, this ${opens} comes back at ${price}.`
}

function pricesOf(plan: SmartGrid["plan"]): AtPrice[] {
  const at = new Map<string, AtPrice>()
  const slot = (px: number): AtPrice => {
    const key = priceKey(px)
    const found = at.get(key)
    if (found) return found
    const made: AtPrice = {
      px,
      entry: null,
      holding: null,
      carried: false,
      dead: false,
      edge: null,
      usd: 0,
    }
    at.set(key, made)
    return made
  }

  for (const [index, level] of plan.levels.entries()) {
    // A level called off by hand is gone for good and is not drawn.
    if (level.status === "cancelled") continue
    if (level.status === "waiting") {
      const one = slot(level.buyPx)
      one.entry = index
      one.usd = level.buyPx * level.sz
      if (level.dead) one.dead = true
    } else {
      const one = slot(level.buyPx)
      one.holding = index
      one.usd = level.buyPx * level.sz
    }
  }
  for (const level of plan.carriedLevels) {
    if (level.status !== "holding") continue
    const one = slot(level.buyPx)
    one.holding = -1
    one.carried = true
    one.usd += level.buyPx * level.heldSz
  }
  // The ends of the range are not separate things to draw. One of them IS the
  // deepest level's own price — the bottom on a buying grid, the top on a
  // selling one — and that is what makes the range mean what it says. So they
  // name the line already at that price rather than adding a second one beside
  // it.
  const bottom = at.get(priceKey(plan.bottomPx))
  if (bottom) bottom.edge = "bottom"
  const top = at.get(priceKey(plan.topPx))
  if (top) top.edge = "top"

  return [...at.values()].sort((a, b) => a.px - b.px)
}

/** What the grid's open levels would make or lose if they all closed here. */
function gridResultAt(plan: SmartGrid["plan"], exitPx: number): number {
  const sign = plan.direction === "long" ? 1 : -1
  let result = 0
  for (const level of [...plan.levels, ...plan.carriedLevels]) {
    if (level.status !== "holding") continue
    result += (exitPx - level.buyPx) * level.heldSz * sign
  }
  return result
}

function gridStopName(
  plan: SmartGrid["plan"],
  stopPx: number,
  feesPaid: number | null
): string {
  if (feesPaid === null) return "STOP LOSS —"
  return `STOP LOSS ${formatSignedUsd(gridResultAt(plan, stopPx) - feesPaid)}`
}

/** Which of the grid's four lines a drag is moving. */
type DragEnd = "top" | "bottom" | "takeProfit" | "stopLoss"

function GridLines({
  grid,
  currentPx,
  colors,
  yFor,
  yPinned,
  tool,
  walletName,
  feesPaid,
  onCancelLevel,
  onCancelGrid,
  onOpenSettings,
  onReverseGrid,
  reverseDisabledReason,
  onMoveRange,
  onMoveExit,
  measureTop,
  priceFrom,
}: {
  grid: SmartGrid
  currentPx: number | null
  colors: ChartColors
  yFor: (price: number) => number | null
  yPinned: (
    price: number
  ) => { y: number; off: "above" | "below" | null } | null
  tool: string | null
  walletName: (walletId: string) => string
  feesPaid: number | null
  onCancelLevel: (walletId: string, gridId: string, levelIndex: number) => void
  onCancelGrid: (grid: SmartGrid) => void
  onOpenSettings: (grid: SmartGrid, anchor: HTMLElement) => void
  /** Opens the reversal confirmation for this grid. */
  onReverseGrid: (grid: SmartGrid) => void
  /** Why this grid cannot be reversed right now, or null when it can. */
  reverseDisabledReason: (grid: SmartGrid) => string | null
  onMoveRange: (
    grid: SmartGrid,
    move: { end: "top" | "bottom"; px: number }
  ) => Promise<boolean>
  onMoveExit: (
    grid: SmartGrid,
    which: "takeProfit" | "stopLoss",
    px: number
  ) => Promise<boolean>
  /** Where the layer's box starts on screen, measured once per drag. */
  measureTop: () => number | null
  /** The price under a pointer, from its clientY and the measured top. */
  priceFrom: (clientY: number, top: number) => number | null
}) {
  const plan = grid.plan
  const direction = plan.direction
  const levelCount = plan.levels.length
  // Green where the grid buys, red where it sells — whichever half of the
  // round trip that is. A buying grid's waiting levels are green and its held
  // ones red; a selling grid is the other way round.
  const sideColour = (side: "buy" | "sell") =>
    side === "buy" ? colors.up : colors.down
  const waiting = plan.levels.filter(
    (level) => level.status === "waiting"
  ).length
  const holding =
    plan.levels.filter((level) => level.status === "holding").length +
    plan.carriedLevels.length
  // While a paint tool is held, these controls must not steal its presses.
  const controls = tool ? "none" : "auto"

  // One open entry becomes the fixed point. Its own edge, when it sits on an
  // edge, has no grip; every other valid end stays available.
  const topMovable = gridRangeEndMovable(plan, "top")
  const bottomMovable = gridRangeEndMovable(plan, "bottom")
  // The end being dragged, as a price, while the pointer is down.
  const [dragging, setDragging] = React.useState<{
    end: DragEnd
    px: number
  } | null>(null)
  /**
   * Where a line was just dropped, held until the server's answer comes back.
   *
   * Without it the line snaps to its old price the instant you let go and
   * jumps to the new one a second later, when the next poll brings the saved
   * plan — which reads as lag even though the drag itself was smooth. Keeping
   * the dropped price on screen makes the move look instant, which it is: the
   * server is only catching up.
   */
  const [pending, setPending] = React.useState<{
    end: DragEnd
    px: number
    was: number | null
  } | null>(null)

  /**
   * Dragging one of the grid's four lines to a new price.
   *
   * The line follows the pointer while the button is down and only asks the
   * server when it is let go — a grid re-prices every level on a move, so doing
   * that on every pixel would be a hundred round trips per drag.
   */
  const startDrag =
    (which: DragEnd, from: number) => (event: React.PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      // Measured once, here. The box cannot move mid-drag, and asking the
      // browser for it on every pixel forced a layout per mouse move.
      const top = measureTop()
      if (top === null) return
      // Pointer moves arrive faster than the screen repaints, so they are
      // coalesced onto one animation frame — the same rule the chart's own
      // surface uses. The line still lands on every frame; it just stops
      // being asked to land between them.
      let frame = 0
      let lastY = event.clientY
      const onMove = (move: PointerEvent) => {
        lastY = move.clientY
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          const px = priceFrom(lastY, top)
          if (px !== null && px > 0) setDragging({ end: which, px })
        })
      }
      const onUp = (up: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        if (frame) cancelAnimationFrame(frame)
        const px = priceFrom(up.clientY, top)
        setDragging(null)
        if (px === null || !(px > 0)) return
        // A drag that ends where it started is a click, not a move.
        if (Math.abs(from - px) < 1e-9) return
        const rangeEnd = which === "top" || which === "bottom"
        if (rangeEnd && !gridRangeAfterMove(plan, { end: which, px })) return
        // Shown where it was dropped from this moment on, so letting go looks
        // like the end of the move rather than the start of a wait.
        setPending({ end: which, px, was: savedFor(which) })
        const settled = rangeEnd
          ? onMoveRange(grid, { end: which, px })
          : onMoveExit(grid, which, px)
        // A refused move never changes the plan, so nothing would clear the
        // held price and the line would sit at a price it never reached.
        if (!settled) setPending(null)
        else
          void settled.then((ok) => {
            if (!ok) setPending(null)
          })
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    }

  // While a drag is in flight the band follows the pointer, so the range is
  // shown where it is being put rather than where it still is.
  /** What the plan says a line sits at right now. */
  const savedFor = (end: DragEnd): number | null =>
    end === "top"
      ? plan.topPx
      : end === "bottom"
        ? plan.bottomPx
        : end === "takeProfit"
          ? gridTakeProfitPx(plan)
          : gridStopPx(plan)

  /**
   * The pointer wins, then the price just dropped, then what is saved.
   *
   * The dropped price is shown only while the plan still says what it said
   * when the line was let go. The moment the server's answer arrives the plan
   * changes, and this stops using the held price on its own — no effect, and
   * nothing to clear.
   */
  const showing = (end: DragEnd, saved: number | null): number | null => {
    if (dragging?.end === end) return dragging.px
    if (pending?.end === end && pending.was === saved) return pending.px
    return saved
  }
  const activeRangeMove = (() => {
    if (dragging?.end === "top" || dragging?.end === "bottom") {
      return { end: dragging.end, px: dragging.px }
    }
    if (
      (pending?.end === "top" || pending?.end === "bottom") &&
      pending.was === savedFor(pending.end)
    ) {
      return { end: pending.end, px: pending.px }
    }
    return null
  })()
  const shownRange =
    (activeRangeMove && gridRangeAfterMove(plan, activeRangeMove)) ?? plan
  const shownTop = shownRange.topPx
  const shownBottom = shownRange.bottomPx

  // The band fills whatever part of the range is on screen. The two names are
  // always drawn — pinned to the chart's edge with an arrow when their own
  // price has scrolled out of view.
  const pinTop = yPinned(shownTop)
  const pinBottom = yPinned(shownBottom)
  const bandTop = pinTop?.y ?? null
  const bandBottom = pinBottom?.y ?? null
  // An end scrolled out of view is pinned to the chart's edge, and dragging it
  // from there still works — you pull it back into view. The one case that
  // does not work is both ends pinned to the SAME edge, where the two labels
  // land on the same pixel and there is no telling them apart.
  //
  // This used to hide the grips whenever either end was off screen, which on a
  // tightly zoomed chart is most of the time — so the range could not be
  // dragged at all, which is not what "off screen" should cost you.
  const grippable =
    pinTop !== null &&
    pinBottom !== null &&
    !(pinTop.off !== null && pinTop.off === pinBottom.off)
  // Is the range being moved right now — dragged, or dropped and waiting?
  const rangeMoved = shownTop !== plan.topPx || shownBottom !== plan.bottomPx

  /**
   * The levels the moved range would have, worked out here rather than waited
   * for.
   *
   * The two ends followed the pointer while everything between them stayed at
   * the old prices until the server answered — so the range appeared to move
   * and its contents lagged a second behind it. They come from the same
   * `gridLevels` the server uses, so what is drawn while dragging is what will
   * be saved.
   */
  const movingLevels = rangeMoved
    ? gridLevels({
        ...shownRange,
        levels: plan.levels.length,
        spacing: plan.spacing,
        direction,
      })
    : null

  // Both exits hang off the range, so both follow it while it moves — the same
  // arithmetic the server does when it saves.
  const movedStop =
    rangeMoved && plan.stopLoss?.mode === "percent" && !plan.stopLoss.base
      ? gridStopBeyond(direction, shownRange, plan.stopLoss.underPct)
      : null
  const movedTarget = rangeMoved
    ? gridEndAfterRangeMove(plan, shownRange, currentPx ?? plan.topPx)
    : null

  const shownTarget =
    movedTarget ?? showing("takeProfit", gridTakeProfitPx(plan))
  const shownStop = movedStop ?? showing("stopLoss", gridStopPx(plan))
  const stop = gridStopPx(plan)
  const stopY =
    shownStop !== null ? yFor(shownStop) : stop === null ? null : yFor(stop)
  const stopName =
    shownStop === null ? null : gridStopName(plan, shownStop, feesPaid)
  const prices = pricesOf(plan)
  /**
   * The level sitting exactly on the losing end of the range, if any.
   *
   * There always is one: the deepest level's own price IS that end — the
   * bottom on a buying grid, the top on a selling one — which is what makes
   * the range mean what it says. So it is drawn ONCE, as that named line
   * carrying the level's money and its ×, rather than as a range line and a
   * level line stacked on the same pixel with two badges.
   */
  const deepPx = lossEdge(direction, plan)
  const deepLevel =
    prices.find((at) => priceKey(at.px) === priceKey(deepPx)) ?? null
  const bottomLevel = direction === "long" ? deepLevel : null
  const topLevel = direction === "long" ? null : deepLevel
  const target = gridTakeProfitPx(plan)
  const targetY =
    shownTarget !== null
      ? yFor(shownTarget)
      : target === null
        ? null
        : yFor(target)

  return (
    <>
      {/* The range, as a shaded band rather than two lines.
          A line at the bottom of the range would sit exactly on top of the
          deepest buy, because they are the SAME PRICE — the grid buys down to
          its bottom and sells up to its top, which is what makes the range mean
          what it says. Two lines at one price is a picture of something that
          does not exist. A band has no line to collide with, and it says the
          thing the edges were there to say much better: this is the stretch of
          chart the grid works in. */}
      {/* The stretch of chart the grid works in. */}
      {bandTop !== null && bandBottom !== null && bandBottom > bandTop ? (
        <div
          className="absolute inset-x-0"
          style={{
            top: bandTop,
            height: bandBottom - bandTop,
            backgroundColor: colors.primary,
            opacity: dragging ? 0.1 : 0.05,
          }}
        />
      ) : null}

      {/* The levels between the ends: a thin line and a price, nothing more.
          Green where the grid buys, red where it sells — the two things you
          actually want to tell apart at a glance. */}
      {/* While the range is moving, the levels it WOULD have — plain lines with
          a price, since they are not yet anything to cancel. */}
      {movingLevels?.map((level, index) => {
        const saved = plan.levels[index]
        const holding = saved.status === "holding"
        const px = holding ? saved.buyPx : level.buyPx
        const y = yFor(px)
        if (y === null) return null
        return (
          <ChartLine
            key={`moving-${index}`}
            y={y}
            usd={holding ? saved.buyPx * saved.heldSz : undefined}
            colour={sideColour(
              holding ? exitSide(direction) : entrySide(direction)
            )}
            name={null}
            dashed={false}
            faded={!holding}
            title={
              holding
                ? `Opened at ${formatPrice(saved.buyPx)}. The entry stays fixed while the other levels move.`
                : undefined
            }
          />
        )
      })}

      {(movingLevels ? [] : prices)
        .filter((at) => at !== deepLevel)
        .map((at) => {
          const y = yFor(at.px)
          if (y === null) return null
          const holding = at.holding !== null
          return (
            <ChartLine
              key={priceKey(at.px)}
              y={y}
              usd={at.usd}
              colour={sideColour(
                holding ? exitSide(direction) : entrySide(direction)
              )}
              name={null}
              dashed={at.dead}
              faded={at.dead}
              title={levelTitle(direction, at, holding)}
              action={
                at.entry !== null ? (
                  <button
                    type="button"
                    aria-label={`Cancel the ${entrySide(direction)} at ${formatPrice(at.px)}`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    style={{ pointerEvents: controls }}
                    onClick={() =>
                      onCancelLevel(grid.walletId, grid.id, at.entry as number)
                    }
                  >
                    <XIcon className="size-3" />
                  </button>
                ) : null
              }
            />
          )
        })}

      {/* The two ends of the range. One open level stays fixed while these
          compress or expand the other prices around it. */}
      {pinBottom ? (
        <ChartLine
          y={pinBottom.y}
          // On a buying grid the bottom of the range IS the deepest buy, so it
          // carries that level's money like every other level line. On a
          // selling grid the bottom is only where the lowest sell buys back,
          // and nothing opens there.
          usd={bottomLevel?.usd}
          colour={colors.primary}
          name={gridBoundaryName(direction, "bottom", levelCount)}
          dashed={pinBottom.off !== null}
          grip={bottomMovable && grippable}
          onGripDown={
            bottomMovable ? startDrag("bottom", plan.bottomPx) : undefined
          }
          title={edgeTitle(direction, "bottom", bottomLevel, bottomMovable)}
          action={
            bottomLevel?.entry != null ? (
              <button
                type="button"
                aria-label={`Cancel the ${entrySide(direction)} at ${formatPrice(plan.bottomPx)}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                style={{ pointerEvents: controls }}
                onClick={() =>
                  onCancelLevel(
                    grid.walletId,
                    grid.id,
                    bottomLevel.entry as number
                  )
                }
              >
                <XIcon className="size-3" />
              </button>
            ) : null
          }
        />
      ) : null}
      {pinTop ? (
        <ChartLine
          y={pinTop.y}
          usd={topLevel?.usd}
          colour={colors.primary}
          name={gridBoundaryName(direction, "top", levelCount)}
          dashed={pinTop.off !== null}
          grip={topMovable && grippable}
          onGripDown={topMovable ? startDrag("top", plan.topPx) : undefined}
          title={edgeTitle(direction, "top", topLevel, topMovable)}
          action={
            <>
              {topLevel?.entry != null ? (
                <button
                  type="button"
                  aria-label={`Cancel the ${entrySide(direction)} at ${formatPrice(plan.topPx)}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  style={{ pointerEvents: controls }}
                  onClick={() =>
                    onCancelLevel(
                      grid.walletId,
                      grid.id,
                      topLevel.entry as number
                    )
                  }
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
              <span
                className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.badgeText,
                  pointerEvents: controls,
                }}
                // Says what the grid is doing rather than assuming a buy.
                title={`${walletName(grid.walletId)} — ${GRID_DIRECTION_LABELS[direction].toLowerCase()}${plan.reversedFrom ? ", continuing a reversed grid on this range" : ""}. ${waiting} waiting, ${holding} holding${plan.cycles > 0 ? `, ${plan.cycles} round trips` : ""}.`}
              >
                {waiting}/{plan.levels.length}
                {(() => {
                  const why = reverseDisabledReason(grid)
                  return (
                    <button
                      type="button"
                      aria-label="Reverse the grid"
                      aria-disabled={why !== null}
                      className={cn(
                        "rounded p-0.5 focus-visible:bg-current/20 focus-visible:outline-none",
                        why === null
                          ? "hover:bg-current/20"
                          : "cursor-not-allowed opacity-50"
                      )}
                      // A greyed-out button says why, on hover — never a
                      // button that is simply missing.
                      title={
                        why ??
                        "Reverse the grid: close what it holds at market and work the same range the other way round."
                      }
                      onClick={() => {
                        if (why === null) onReverseGrid(grid)
                      }}
                    >
                      <ArrowUpDownIcon className="size-3" />
                    </button>
                  )
                })()}
                <button
                  type="button"
                  aria-label="Change the grid's exits"
                  className="rounded p-0.5 hover:bg-current/20 focus-visible:bg-current/20 focus-visible:outline-none"
                  onClick={(event) => onOpenSettings(grid, event.currentTarget)}
                >
                  <SettingsIcon className="size-3" />
                </button>
                {waiting > 0 ? (
                  <button
                    type="button"
                    aria-label={`Stop the grid trading — cancel every waiting ${entrySide(direction)}`}
                    className="rounded p-0.5 hover:bg-current/20 focus-visible:bg-current/20 focus-visible:outline-none"
                    onClick={() => onCancelGrid(grid)}
                  >
                    <XIcon className="size-3" />
                  </button>
                ) : null}
              </span>
            </>
          }
        />
      ) : null}

      {/* The two ways out. Green is money made and red is the loss limit,
          whichever side of the range each one sits. */}
      {targetY !== null && target !== null ? (
        <ChartLine
          y={targetY}
          colour={colors.up}
          name="END GRID"
          dashed={false}
          grip
          onGripDown={startDrag("takeProfit", target)}
          title={`Reaching this closes everything the grid holds and ends it. Drag it anywhere ${direction === "long" ? "above" : "below"} the range.`}
        />
      ) : null}
      {stopY !== null && stop !== null && stopName !== null ? (
        <ChartLine
          y={stopY}
          colour={colors.down}
          name={stopName}
          dashed={false}
          grip
          onGripDown={startDrag("stopLoss", stop)}
          title={`Price cutting through this closes everything and ends the grid. ${
            feesPaid === null
              ? "The fills on hand do not cover the opening fees."
              : "The dollar figure takes off the opening fees already charged. The closing fee is known only after the order fills."
          } Drag it anywhere ${direction === "long" ? "below" : "above"} the current price — inside the range trails the stop, and the rungs past it go quiet until it moves clear again.`}
        />
      ) : null}
    </>
  )
}

/**
 * What one end of the range means in the grid's direction.
 *
 * Five rungs need six prices because every rung has an opening trade and a
 * closing trade one step away. Naming the trade at each end makes that sixth
 * line explain itself instead of looking like an extra rung.
 */
function gridBoundaryName(
  direction: GridDirection,
  end: "top" | "bottom",
  levelCount: number
): string {
  const edge = end === "top" ? "UPPER" : "LOWER"
  if (direction === "long") {
    return end === "top"
      ? `${edge} PRICE · RUNG 1 SELLS`
      : `${edge} PRICE · RUNG ${levelCount} BUYS`
  }
  return end === "top"
    ? `${edge} PRICE · RUNG ${levelCount} SELLS`
    : `${edge} PRICE · RUNG 1 BUYS BACK`
}

/** What each kind of line looks like and what it is called. */
function lineLook(
  kind: GridPreview["lines"][number]["kind"],
  colors: ChartColors,
  direction: GridDirection,
  levelCount: number
): { colour: string; name: string | null; dashed: boolean } {
  if (kind === "upper") {
    return {
      colour: colors.primary,
      name: gridBoundaryName(direction, "top", levelCount),
      dashed: false,
    }
  }
  if (kind === "lower") {
    return {
      colour: colors.primary,
      name: gridBoundaryName(direction, "bottom", levelCount),
      dashed: false,
    }
  }
  if (kind === "takeProfit") {
    return { colour: colors.up, name: "END GRID", dashed: false }
  }
  if (kind === "stopLoss") {
    return { colour: colors.down, name: "STOP LOSS", dashed: false }
  }
  // A level, in the colour of the trade it would open with.
  return {
    colour: entrySide(direction) === "buy" ? colors.up : colors.down,
    name: null,
    dashed: false,
  }
}

/**
 * One line across the chart, with a name at the right-hand end when it has
 * one.
 *
 * **No line carries its own price.** A grid draws a dozen lines at once, and a
 * price chip on each of them built a column of solid colour down the right of
 * the chart, over the candles, saying what the price axis two inches away was
 * already saying. The line's height against the axis is where its price is
 * read. What a level puts in, in dollars, is a fact the axis cannot give you,
 * so that badge stays.
 *
 * Only the four lines you set get a name; the levels in between are just a
 * line, because a dozen labelled ones is a wall of text over the price action.
 */
function ChartLine({
  y,
  usd,
  colour,
  name,
  dashed,
  faded,
  grip,
  onGripDown,
  title,
  action,
}: {
  y: number
  /** What this level puts in, when it is a level rather than a boundary. */
  usd?: number
  colour: string
  name: string | null
  dashed: boolean
  faded?: boolean
  /** Draw a drag handle on the name, like the reference client's. */
  grip?: boolean
  onGripDown?: (event: React.PointerEvent) => void
  title?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className={cn("absolute inset-x-0", faded && "opacity-60")}
      style={{ top: y }}
    >
      <div
        className={dashed ? "border-t border-dashed" : "border-t"}
        style={{ borderColor: colour }}
      />
      <div className="absolute top-0 right-0 flex -translate-y-1/2 items-center gap-1">
        {name ? (
          <span
            className={cn(
              "flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 text-xs font-semibold tracking-wide select-none",
              grip && "cursor-ns-resize"
            )}
            style={{
              borderColor: colour,
              color: colour,
              // The layer itself takes no pointer events, so a line that is
              // meant to be dragged has to switch them back on for its own
              // label. Without this the handle is drawn, shows a resize
              // cursor, and does nothing at all when you press it.
              pointerEvents: grip ? "auto" : "none",
              touchAction: "none",
            }}
            onPointerDown={onGripDown}
            title={title}
          >
            {grip ? <GripVerticalIcon className="size-3 opacity-70" /> : null}
            {name}
          </span>
        ) : null}
        {action}
        {/* What this level puts in. Left off the range's own edges, which buy
            nothing by themselves. */}
        {usd !== undefined && usd > 0 ? (
          <span className="rounded-sm bg-muted px-1 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {formatUsdRounded(usd)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ----- Telling the position's pills where our chips are ---------------------

/** A stretch of the right edge a grid line's chips occupy. */
export type GridLineObstacle = {
  top: number
  bottom: number
  /** How far left of the plot's right edge the chips reach, in pixels. */
  width: number
}

/** The estimates the obstacle widths are built from. Generous on purpose:
 * a pill that slides a few pixels further left costs nothing, one that stops
 * a few pixels short sits on the chip — the exact bug this exists to fix. */
const OBSTACLE_CHAR = 6.6
const OBSTACLE_ICON = 20
const OBSTACLE_GRIP = 14
const OBSTACLE_HEIGHT = 22

/**
 * Where every drawn grid line's right-edge furniture sits, so the trade-lines
 * layer can lay its pills down around them.
 *
 * A position's Entry pill and a grid level's money chip often share a height —
 * a grid that just bought IS the position, at that level's own price — and
 * whichever painted last hid the other. Stacking cannot fix two things in one
 * spot; only sliding can, and the trade-lines layer already slides its own
 * pills left of each other. This hands it our chips as things to slide
 * around, worked out from the same `pricesOf` the drawing reads, so the
 * obstacles are the chips and not a guess at them.
 */
export function gridLineObstacles(
  grids: readonly SmartGrid[],
  marketKey: string | null,
  yFor: (price: number) => number | null,
  feesPaidFor?: (grid: SmartGrid) => number | null
): GridLineObstacle[] {
  const obstacles: GridLineObstacle[] = []
  const add = (px: number, width: number) => {
    const y = yFor(px)
    if (y === null || !(width > 0)) return
    obstacles.push({
      top: y - OBSTACLE_HEIGHT / 2,
      bottom: y + OBSTACLE_HEIGHT / 2,
      width: width + 8,
    })
  }
  const nameWidth = (name: string, grip: boolean) =>
    name.length * OBSTACLE_CHAR + 12 + (grip ? OBSTACLE_GRIP : 0)
  const usdWidth = (usd: number) =>
    usd > 0 ? formatUsdRounded(usd).length * OBSTACLE_CHAR + 8 + 4 : 0

  for (const grid of grids) {
    if (grid.marketKey !== marketKey) continue
    const plan = grid.plan
    const topMovable = gridRangeEndMovable(plan, "top")
    const bottomMovable = gridRangeEndMovable(plan, "bottom")
    const deepPx = lossEdge(plan.direction, plan)

    for (const at of pricesOf(plan)) {
      const cancel = at.entry !== null ? OBSTACLE_ICON + 4 : 0
      if (priceKey(at.px) === priceKey(deepPx)) continue
      if (priceKey(at.px) === priceKey(plan.topPx)) continue
      add(at.px, cancel + usdWidth(at.usd))
    }

    // The named lines. The top carries the badge cluster: the count, the
    // reverse icon, the gear and sometimes an ×.
    const deepLevel =
      pricesOf(plan).find((at) => priceKey(at.px) === priceKey(deepPx)) ?? null
    add(
      plan.bottomPx,
      nameWidth(
        gridBoundaryName(plan.direction, "bottom", plan.levels.length),
        bottomMovable
      ) +
        (plan.direction === "long" && deepLevel
          ? (deepLevel.entry !== null ? OBSTACLE_ICON + 4 : 0) +
            usdWidth(deepLevel.usd)
          : 0)
    )
    add(
      plan.topPx,
      nameWidth(
        gridBoundaryName(plan.direction, "top", plan.levels.length),
        topMovable
      ) +
        (plan.direction === "short" && deepLevel
          ? (deepLevel.entry !== null ? OBSTACLE_ICON + 4 : 0) +
            usdWidth(deepLevel.usd)
          : 0) +
        // The badge cluster: "n/m", reverse, gear, ×.
        5 * OBSTACLE_CHAR +
        3 * OBSTACLE_ICON +
        14
    )
    const target = gridTakeProfitPx(plan)
    if (target !== null) add(target, nameWidth("END GRID", true))
    const stop = gridStopPx(plan)
    if (stop !== null) {
      add(
        stop,
        nameWidth(
          gridStopName(plan, stop, feesPaidFor ? feesPaidFor(grid) : 0),
          true
        )
      )
    }
  }
  return obstacles
}
