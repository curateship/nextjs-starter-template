import * as React from "react"
import { GripVerticalIcon, SettingsIcon, XIcon } from "lucide-react"

import type { GridPreviewLine } from "@/components/trade/grid-order-dialog"
import type { ChartSurface } from "@/components/trade/price-chart"
import { formatPrice, formatUsdRounded } from "@/lib/trade/format"
import {
  gridLevels,
  gridRangeMovable,
  gridStopPx,
  gridStopUnder,
  gridTakeProfitPx,
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
 * None of these lines drag. A grid's prices are frozen at placement, exactly as
 * a ladder's rungs are, and the label says so on hover.
 */

/**
 * One colour per meaning, and nothing shares one.
 *
 * The two ends of the range are BLUE and named, because they are the thing you
 * set and the thing you drag. The levels between them are quiet — a thin line
 * and a price, nothing to read. The two ways out are the colours everybody
 * already reads: green for the target, red for the stop.
 */
const BOUND_COLOR = "#2563eb"
const LEVEL_BUY_COLOR = "#059669"
const LEVEL_SELL_COLOR = "#dc2626"
const TAKE_PROFIT_COLOR = "#059669"
const STOP_COLOR = "#dc2626"

export function GridLayer({
  surface,
  marketKey,
  grids,
  preview,
  tool,
  walletName,
  onCancelLevel,
  onCancelGrid,
  onEditStop,
  onMoveRange,
  onMoveExit,
}: {
  surface: ChartSurface
  marketKey: string | null
  /** Every live grid, whichever wallet holds it; this market's are drawn. */
  grids: readonly SmartGrid[]
  /** The placement window's levels as edited, or null when it is shut. */
  preview: readonly GridPreviewLine[] | null
  /** A paint tool in hand takes the pointer; these controls step aside. */
  tool: string | null
  walletName: (walletId: string) => string
  onCancelLevel: (walletId: string, gridId: string, levelIndex: number) => void
  onCancelGrid: (grid: SmartGrid) => void
  onEditStop: (grid: SmartGrid) => void
  onMoveRange: (
    grid: SmartGrid,
    range: { topPx: number; bottomPx: number }
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
    if (!preview || preview.length === 0) return null
    const inRange = preview.filter(
      (one) => one.kind === "upper" || one.kind === "lower" || one.kind === "level"
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
            backgroundColor: BOUND_COLOR,
            opacity: 0.05,
          }}
        />
      ) : null}
      {preview?.map((line, index) => {
        const y = yFor(line.px)
        if (y === null) return null
        const look = LINE_LOOKS[line.kind]
        return (
          <ChartLine
            key={`grid-preview-${index}`}
            y={y}
            px={line.px}
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
          yFor={yFor}
          yPinned={yPinned}
          tool={tool}
          walletName={walletName}
          onCancelLevel={onCancelLevel}
          onCancelGrid={onCancelGrid}
          onEditStop={onEditStop}
          onMoveRange={onMoveRange}
          onMoveExit={onMoveExit}
          priceAt={(clientY) => {
            const top = layerRef.current?.getBoundingClientRect().top
            return top === undefined ? null : surface.priceAt(clientY - top)
          }}
        />
      ))}
    </div>
  )
}

/**
 * What rests at one price, and which level it belongs to.
 *
 * A price is a place, not a level. On an evenly spread grid a level's SELL
 * price is the next level's BUY price, so drawing a line for each of them puts
 * two lines and two labels on top of each other at every price in the middle of
 * the range. Worse, both really can be resting at once — the level below is
 * holding and selling here, the level above is waiting and buying here — so it
 * is not a duplicate to hide, it is two orders at one price that have to be
 * said in one label.
 */
type AtPrice = {
  px: number
  buy: number | null
  sell: number | null
  holding: number | null
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

function pricesOf(plan: SmartGrid["plan"]): AtPrice[] {
  const at = new Map<string, AtPrice>()
  const slot = (px: number): AtPrice => {
    const key = priceKey(px)
    const found = at.get(key)
    if (found) return found
    const made: AtPrice = {
      px,
      buy: null,
      sell: null,
      holding: null,
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
      one.buy = index
      one.usd = level.buyPx * level.sz
      if (level.dead) one.dead = true
    } else {
      const one = slot(level.buyPx)
      one.holding = index
      one.usd = level.buyPx * level.sz
    }
  }
  // The ends of the range are not separate things to draw. The bottom IS the
  // deepest buy and the top IS the shallowest sell — that is what makes the
  // range mean what it says — so they name the line already at that price
  // rather than adding a second one beside it.
  const bottom = at.get(priceKey(plan.bottomPx))
  if (bottom) bottom.edge = "bottom"
  const top = at.get(priceKey(plan.topPx))
  if (top) top.edge = "top"

  return [...at.values()].sort((a, b) => a.px - b.px)
}

/** Which of the grid's four lines a drag is moving. */
type DragEnd = "top" | "bottom" | "takeProfit" | "stopLoss"

function GridLines({
  grid,
  yFor,
  yPinned,
  tool,
  walletName,
  onCancelLevel,
  onCancelGrid,
  onEditStop,
  onMoveRange,
  onMoveExit,
  priceAt,
}: {
  grid: SmartGrid
  yFor: (price: number) => number | null
  yPinned: (price: number) => { y: number; off: "above" | "below" | null } | null
  tool: string | null
  walletName: (walletId: string) => string
  onCancelLevel: (walletId: string, gridId: string, levelIndex: number) => void
  onCancelGrid: (grid: SmartGrid) => void
  onEditStop: (grid: SmartGrid) => void
  onMoveRange: (
    grid: SmartGrid,
    range: { topPx: number; bottomPx: number }
  ) => Promise<boolean>
  onMoveExit: (
    grid: SmartGrid,
    which: "takeProfit" | "stopLoss",
    px: number
  ) => Promise<boolean>
  /** The price under a pointer, from its clientY. */
  priceAt: (clientY: number) => number | null
}) {
  const plan = grid.plan
  const waiting = plan.levels.filter((level) => level.status === "waiting").length
  const holding = plan.levels.filter((level) => level.status === "holding").length
  // While a paint tool is held, these controls must not steal its presses.
  const controls = tool ? "none" : "auto"

  // The range can only be moved before anything has bought — see
  // `gridRangeMovable`. After that the handles are simply not there, rather
  // than there and refusing, so the chart never offers something it will say no
  // to.
  const movable = gridRangeMovable(plan)
  // The end being dragged, as a price, while the pointer is down.
  const [dragging, setDragging] = React.useState<
    { end: DragEnd; px: number } | null
  >(null)
  /**
   * Where a line was just dropped, held until the server's answer comes back.
   *
   * Without it the line snaps to its old price the instant you let go and
   * jumps to the new one a second later, when the next poll brings the saved
   * plan — which reads as lag even though the drag itself was smooth. Keeping
   * the dropped price on screen makes the move look instant, which it is: the
   * server is only catching up.
   */
  const [pending, setPending] = React.useState<
    { end: DragEnd; px: number; was: number | null } | null
  >(null)

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
      const onMove = (move: PointerEvent) => {
        const px = priceAt(move.clientY)
        if (px !== null && px > 0) setDragging({ end: which, px })
      }
      const onUp = (up: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        const px = priceAt(up.clientY)
        setDragging(null)
        if (px === null || !(px > 0)) return
        // A drag that ends where it started is a click, not a move.
        if (Math.abs(from - px) < 1e-9) return
        // Shown where it was dropped from this moment on, so letting go looks
        // like the end of the move rather than the start of a wait.
        setPending({ end: which, px, was: savedFor(which) })
        const settled =
          which === "top" || which === "bottom"
            ? (() => {
                const next =
                  which === "top"
                    ? { topPx: px, bottomPx: plan.bottomPx }
                    : { topPx: plan.topPx, bottomPx: px }
                if (!(next.topPx > next.bottomPx)) return null
                return onMoveRange(grid, next)
              })()
            : onMoveExit(grid, which, px)
        // A refused move never changes the plan, so nothing would clear the
        // held price and the line would sit at a price it never reached.
        if (!settled) setPending(null)
        else void settled.then((ok) => { if (!ok) setPending(null) })
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
  const shownTop = showing("top", plan.topPx) ?? plan.topPx
  const shownBottom = showing("bottom", plan.bottomPx) ?? plan.bottomPx

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
  const rangeMoved =
    shownTop !== plan.topPx || shownBottom !== plan.bottomPx

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
        topPx: shownTop,
        bottomPx: shownBottom,
        levels: plan.levels.length,
        spacing: plan.spacing,
      })
    : null

  // Both exits hang off the range, so both follow it while it moves — the same
  // arithmetic the server does when it saves.
  const movedStop =
    rangeMoved && plan.stopLoss?.mode === "percent" && !plan.stopLoss.base
      ? gridStopUnder(shownBottom, plan.stopLoss.underPct)
      : null
  const movedTarget =
    rangeMoved && plan.takeProfitPx !== null && plan.topPx > 0
      ? shownTop * (plan.takeProfitPx / plan.topPx)
      : null

  const shownTarget = movedTarget ?? showing("takeProfit", gridTakeProfitPx(plan))
  const shownStop = movedStop ?? showing("stopLoss", gridStopPx(plan))
  const stop = gridStopPx(plan)
  const stopY =
    shownStop !== null ? yFor(shownStop) : stop === null ? null : yFor(stop)
  const prices = pricesOf(plan)
  /**
   * The level sitting exactly on the bottom of the range, if any.
   *
   * There always is one: the deepest buy IS the bottom, which is what makes the
   * range mean what it says. So it is drawn ONCE, as the LOWER PRICE line
   * carrying that level's own price and its ×, rather than as a range line and
   * a level line stacked on the same pixel with two price badges.
   */
  const bottomLevel =
    prices.find((at) => priceKey(at.px) === priceKey(plan.bottomPx)) ?? null
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
            backgroundColor: BOUND_COLOR,
            opacity: dragging ? 0.1 : 0.05,
          }}
        />
      ) : null}

      {/* The levels between the ends: a thin line and a price, nothing more.
          Red where the grid is selling, green where it is waiting to buy —
          the two things you actually want to tell apart at a glance. */}
      {/* While the range is moving, the levels it WOULD have — plain lines with
          a price, since they are not yet anything to cancel. */}
      {movingLevels?.map((level, index) => {
        const y = yFor(level.buyPx)
        if (y === null) return null
        return (
          <ChartLine
            key={`moving-${index}`}
            y={y}
            px={level.buyPx}
            colour={LEVEL_BUY_COLOR}
            name={null}
            dashed={false}
            faded
          />
        )
      })}

      {(movingLevels ? [] : prices)
        .filter((at) => at !== bottomLevel)
        .map((at) => {
        const y = yFor(at.px)
        if (y === null) return null
        const selling = at.sell !== null || at.holding !== null
        return (
          <ChartLine
            key={priceKey(at.px)}
            y={y}
            px={at.px}
            usd={at.usd}
            colour={selling ? LEVEL_SELL_COLOR : LEVEL_BUY_COLOR}
            name={null}
            dashed={at.dead}
            faded={at.dead}
            title={
              at.dead
                ? "Below your stop — it cannot buy without the stop firing first. It wakes up if the stop moves down."
                : selling
                  ? `Selling here. When it fills, a buy goes back on at ${formatPrice(at.px)} one step down.`
                  : `Waiting to buy ${formatPrice(at.px)}. When it fills, a sell goes on one step above — and when THAT fills, this buy comes back.`
            }
            action={
              at.buy !== null ? (
                <button
                  type="button"
                  aria-label={`Cancel the buy at ${formatPrice(at.px)}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  style={{ pointerEvents: controls }}
                  onClick={() =>
                    onCancelLevel(grid.walletId, grid.id, at.buy as number)
                  }
                >
                  <XIcon className="size-3" />
                </button>
              ) : null
            }
          />
        )
      })}

      {/* The two ends of the range — named, blue, and draggable while nothing
          has bought. These are the thing you set, so they are the only lines
          here that carry a name and a grip. */}
      {pinBottom ? (
        <ChartLine
          y={pinBottom.y}
          px={shownBottom}
          // The bottom of the range IS the deepest buy, so it carries that
          // level's money like every other level line.
          usd={bottomLevel?.usd}
          colour={BOUND_COLOR}
          name="LOWER PRICE"
          dashed={pinBottom.off !== null}
          grip={movable && grippable}
          onGripDown={movable ? startDrag("bottom", plan.bottomPx) : undefined}
          title={
            bottomLevel?.holding !== null && bottomLevel !== null
              ? "The bottom of the range, and the deepest thing it holds."
              : "The bottom of the range, and its deepest buy. Drag to move it."
          }
          action={
            bottomLevel?.buy != null ? (
              <button
                type="button"
                aria-label={`Cancel the buy at ${formatPrice(plan.bottomPx)}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                style={{ pointerEvents: controls }}
                onClick={() =>
                  onCancelLevel(grid.walletId, grid.id, bottomLevel.buy as number)
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
          px={shownTop}
          colour={BOUND_COLOR}
          name="UPPER PRICE"
          dashed={pinTop.off !== null}
          grip={movable && grippable}
          onGripDown={movable ? startDrag("top", plan.topPx) : undefined}
          title={
            movable
              ? "Drag to move the top of the range. Only until the grid buys something."
              : "The top of the range. It is fixed now the grid has started buying."
          }
          action={
            <span
              className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: BOUND_COLOR, pointerEvents: controls }}
              title={`${walletName(grid.walletId)} — ${waiting} waiting, ${holding} holding${plan.cycles > 0 ? `, ${plan.cycles} round trips` : ""}.`}
            >
              {waiting}/{plan.levels.length}
              <button
                type="button"
                aria-label="Change the grid's exits"
                className="rounded p-0.5 hover:bg-white/20 focus-visible:bg-white/20 focus-visible:outline-none"
                onClick={() => onEditStop(grid)}
              >
                <SettingsIcon className="size-3" />
              </button>
              {waiting > 0 ? (
                <button
                  type="button"
                  aria-label="Stop the grid buying — cancel every waiting level"
                  className="rounded p-0.5 hover:bg-white/20 focus-visible:bg-white/20 focus-visible:outline-none"
                  onClick={() => onCancelGrid(grid)}
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
            </span>
          }
        />
      ) : null}

      {/* The two ways out. */}
      {targetY !== null && target !== null ? (
        <ChartLine
          y={targetY}
          px={shownTarget ?? target}
          colour={TAKE_PROFIT_COLOR}
          name="TAKE PROFIT"
          dashed={false}
          grip
          onGripDown={startDrag("takeProfit", target)}
          title="Reaching this sells everything the grid holds and finishes it. Drag it anywhere above the range."
        />
      ) : null}
      {stopY !== null && stop !== null ? (
        <ChartLine
          y={stopY}
          px={shownStop ?? stop}
          colour={STOP_COLOR}
          name="STOP LOSS"
          dashed={false}
          grip
          onGripDown={startDrag("stopLoss", stop)}
          title="Price cutting through this sells everything and ends the grid. Drag it anywhere below the range."
        />
      ) : null}
    </>
  )
}

/** What each kind of line looks like and what it is called. */
const LINE_LOOKS: Record<
  GridPreviewLine["kind"],
  { colour: string; name: string | null; dashed: boolean }
> = {
  upper: { colour: BOUND_COLOR, name: "UPPER PRICE", dashed: false },
  lower: { colour: BOUND_COLOR, name: "LOWER PRICE", dashed: false },
  takeProfit: { colour: TAKE_PROFIT_COLOR, name: "TAKE PROFIT", dashed: false },
  stopLoss: { colour: STOP_COLOR, name: "STOP LOSS", dashed: false },
  level: { colour: LEVEL_SELL_COLOR, name: null, dashed: false },
}

/**
 * One line across the chart with its price at the right-hand end, and a name
 * beside it when it has one.
 *
 * The price always sits in the same place — hard against the right edge, where
 * the price axis is — so a column of them reads down the side of the chart
 * instead of scattering pills over the candles. Only the four lines you set get
 * a name; the levels in between are just a line and a number, because a dozen
 * labelled ones is a wall of text over the price action.
 */
function ChartLine({
  y,
  px,
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
  px: number
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
      <div className="absolute right-0 top-0 flex -translate-y-1/2 items-center gap-1">
        {name ? (
          <span
            className={cn(
              "flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 text-[10px] font-semibold tracking-wide select-none",
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
        {/* The money first, quietly, then the price in its own colour — the
            same order the rest of the app reads in: what it costs, then where.
            Left off the range's own edges, which buy nothing by themselves. */}
        {usd !== undefined && usd > 0 ? (
          <span className="rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {formatUsdRounded(usd)}
          </span>
        ) : null}
        <span
          className="rounded-sm px-1 py-0.5 text-[10px] font-medium tabular-nums text-white"
          style={{ backgroundColor: colour }}
        >
          {formatPrice(px)}
        </span>
      </div>
    </div>
  )
}
