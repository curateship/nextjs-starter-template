import * as React from "react"
import {
  ArrowUpDownIcon,
  GripVerticalIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import type {
  GridPreview,
  GridPreviewDragKind,
} from "@/components/trade/grid-order-dialog"
import type { ChartSurface } from "@/components/trade/price-chart"
import type { ChartColors } from "@/lib/trade/chart-theme"
import {
  formatPrice,
  formatSignedUsd,
  formatUsdRounded,
} from "@/lib/trade/format"
import {
  entrySide,
  entryWord,
  exitSide,
  gridEndAfterRangeMove,
  gridLevels,
  gridRangeAfterMove,
  gridRangeEndMovable,
  gridRangeFromNearRung,
  gridRangeReshapable,
  gridStopAfterWholeMove,
  gridStopBeyond,
  gridStopPx,
  gridTakeProfitPx,
  lossEdge,
  winEdge,
  GRID_DIRECTION_LABELS,
  type GridDirection,
  type GridLevelState,
  type GridRangeMove,
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
 *
 * The two named range lines, UPPER PRICE and LOWER PRICE, sit on the first and
 * last rung's own prices — Tyler's rule, 3 Sep 2026 — so each boundary sits
 * where that rung trades. A buying grid does not draw the winning edge until
 * rung 1 buys. It then draws that sell as "Rung 1 exit and move up" until the
 * round trip finishes. A selling grid mirrors it: once rung 1 sells, its
 * buy-back is drawn at the bottom edge as "Rung 1 exit and move down"
 * (Tyler, 4 Sep 2026). Everything a grid draws is green when it buys the dips
 * and red when it shorts the rallies, and the End Grid line is orange so it
 * cannot be read as a level.
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
  onMoveRange: (grid: SmartGrid, move: GridRangeMove) => Promise<boolean>
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

  /** One preview edge mid-drag. The full plan is rebuilt only on drop. */
  const [previewDrag, setPreviewDrag] = React.useState<{
    index: number
    px: number
  } | null>(null)

  /** How far every preview price is moving while its middle grip is held. */
  const [previewMove, setPreviewMove] = React.useState<{
    offset: number
  } | null>(null)

  // The preview's range, edge to edge. The named UPPER and LOWER lines sit on
  // rungs, and one of them is a step inside the range, so the range's own
  // edges are the outermost of the named lines and the unnamed winning edge.
  const previewEdges = (() => {
    if (!preview) return null
    const edges = preview.lines
      .filter(
        (line) =>
          line.kind === "upper" || line.kind === "lower" || line.kind === "edge"
      )
      .map((line) => line.px)
    if (edges.length < 2) return null
    const topPx = Math.max(...edges)
    const bottomPx = Math.min(...edges)
    return topPx > bottomPx ? { topPx, bottomPx } : null
  })()
  const previewOffset = previewMove?.offset ?? 0

  // The preview's band runs only between the rungs people can see. The outer
  // winning edge still exists in `previewEdges` for placing and dragging, but
  // shading it before rung 1 trades makes it look like another rung. The
  // selling grid follows the buying grid's pattern exactly (Tyler, 4 Sep 2026).
  const previewBand = (() => {
    if (!preview || preview.lines.length === 0) return null
    const inRange = preview.lines.filter(
      (one) =>
        one.kind === "upper" || one.kind === "lower" || one.kind === "level"
    )
    if (inRange.length === 0) return null
    const top = yPinned(
      Math.max(...inRange.map((one) => one.px + previewOffset))
    )
    const bottom = yPinned(
      Math.min(...inRange.map((one) => one.px + previewOffset))
    )
    if (!top || !bottom || bottom.y <= top.y) return null
    return { top: top.y, height: bottom.y - top.y }
  })()

  // The layer's own box is the frame every price on it is measured against,
  // so a drag reads it rather than guessing at a parent — a guess that is
  // wrong by a header's height turns "move the top" into a price nobody
  // pointed at.
  const layerRef = React.useRef<HTMLDivElement | null>(null)

  /**
   * A preview line mid-drag, following the pointer, by its index in the
   * preview's own list. Only the drop is told to the window — the window
   * re-derives every level from the dropped field, and doing that on every
   * pixel would re-plan the grid a hundred times per drag.
   */
  const startPreviewDrag =
    (index: number, kind: GridPreviewDragKind, from: number) =>
    (event: React.PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      // Measured once per drag, the same rule the placed grid's drag follows.
      const top = layerRef.current?.getBoundingClientRect().top ?? null
      if (top === null) return
      let frame = 0
      let lastY = event.clientY
      const onMove = (move: PointerEvent) => {
        lastY = move.clientY
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          const px = surface.priceAt(lastY - top)
          if (px !== null && px > 0) setPreviewDrag({ index, px })
        })
      }
      const onUp = (up: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        if (frame) cancelAnimationFrame(frame)
        const px = surface.priceAt(up.clientY - top)
        setPreviewDrag(null)
        if (px === null || !(px > 0)) return
        // A drag that ends where it started is a click, not a move.
        if (Math.abs(from - px) < 1e-9) return
        preview?.onMoveLine?.(kind, px)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    }

  /** Move every preview line by the same price amount, then rebuild once. */
  const startPreviewGridDrag = (event: React.PointerEvent) => {
    if (!previewEdges || !preview?.onMoveGrid) return
    event.preventDefault()
    event.stopPropagation()
    const top = layerRef.current?.getBoundingClientRect().top ?? null
    if (top === null) return
    const from = surface.priceAt(event.clientY - top)
    if (from === null) return
    let frame = 0
    let lastY = event.clientY
    const offsetAt = (clientY: number) => {
      const px = surface.priceAt(clientY - top)
      if (px === null) return null
      const offset = px - from
      return previewEdges.bottomPx + offset > 0 ? offset : null
    }
    const onMove = (move: PointerEvent) => {
      lastY = move.clientY
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const offset = offsetAt(lastY)
        if (offset !== null) setPreviewMove({ offset })
      })
    }
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      if (frame) cancelAnimationFrame(frame)
      const offset = offsetAt(up.clientY)
      setPreviewMove(null)
      if (offset === null || Math.abs(offset) < 1e-9) return
      preview.onMoveGrid?.({
        topPx: previewEdges.topPx + offset,
        bottomPx: previewEdges.bottomPx + offset,
      })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  /** The focused middle grip moves one small screen step with arrow keys. */
  const movePreviewGridFromKey = (event: React.KeyboardEvent) => {
    if (
      !previewEdges ||
      !preview?.onMoveGrid ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown")
    ) {
      return
    }
    const middle = (previewEdges.topPx + previewEdges.bottomPx) / 2
    const y = surface.yOf(middle)
    if (y === null) return
    const moved = surface.priceAt(y + (event.key === "ArrowUp" ? -8 : 8))
    if (moved === null) return
    const offset = moved - middle
    if (!(previewEdges.bottomPx + offset > 0)) return
    event.preventDefault()
    preview.onMoveGrid({
      topPx: previewEdges.topPx + offset,
      bottomPx: previewEdges.bottomPx + offset,
    })
  }

  /**
   * Every preview line worked out before drawing, so a way out that lands on
   * the same price as UPPER PRICE or LOWER PRICE can lend that row its bar
   * instead of sitting on top of it — the same rule the placed grid keeps.
   */
  const previewDrawn = (() => {
    if (!preview) return null
    const drawn = preview.lines.map((line, index) => {
      // The line being dragged follows the pointer; the rest hold still.
      const shownPx = previewMove
        ? line.px + previewMove.offset
        : previewDrag !== null && previewDrag.index === index
          ? previewDrag.px
          : line.px
      const y = yFor(shownPx)
      if (y === null) return null
      const look = lineLook(line.kind, colors, preview.direction)
      const draggable =
        line.grip === true &&
        line.kind !== "level" &&
        line.kind !== "edge" &&
        line.kind !== "liquidation" &&
        preview.onMoveLine !== undefined &&
        tool === null
      return {
        line,
        index,
        y,
        look,
        draggable,
        name: line.label ?? look.name,
        onGripDown: draggable
          ? startPreviewDrag(index, line.kind as GridPreviewDragKind, line.px)
          : undefined,
        title: draggable
          ? "Drag to move this line. Dropping it rewrites the window's own fields, so the grid you see is the grid you place."
          : undefined,
        /** The rung row this way out's bar is drawn on, or null for its own. */
        chipOn: null as number | null,
      }
    })
    const rows = drawn.filter(
      (one) =>
        one !== null && (one.line.kind === "upper" || one.line.kind === "lower")
    )
    for (const one of drawn) {
      if (
        one === null ||
        (one.line.kind !== "stopLoss" && one.line.kind !== "takeProfit")
      ) {
        continue
      }
      const row = rows.find((r) => r !== null && sharesRow(r.y, one.y))
      if (row) one.chipOn = row.index
    }
    return drawn
  })()
  // The grip sits midway between the UPPER PRICE and LOWER PRICE lines.
  const previewKnobY = (() => {
    const upper = previewDrawn?.find((one) => one?.line.kind === "upper")
    const lower = previewDrawn?.find((one) => one?.line.kind === "lower")
    return upper && lower ? (upper.y + lower.y) / 2 : null
  })()
  const previewUsdSlot = previewDrawn
    ? Math.max(
        0,
        ...previewDrawn.map((one) =>
          one === null || one.line.usd === undefined
            ? 0
            : usdChipWidth(one.line.usd)
        )
      )
    : 0

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
            backgroundColor:
              preview?.direction === "short" ? colors.down : colors.up,
            opacity: 0.05,
          }}
        />
      ) : null}
      {previewBand && previewEdges && preview?.onMoveGrid && tool === null ? (
        <BarRow
          top={previewKnobY ?? previewBand.top + previewBand.height / 2}
          pointerEvents="auto"
          usdSlot={previewUsdSlot}
          rungSlot
        >
          {/* Dressed exactly like a name bar — same width, border, caps —
              in the neutral colour, so it reads as one of the grid's bars.
              Tyler, 3 Sep 2026. */}
          <span
            className={cn(
              BAR_WIDTH,
              "flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 text-xs font-semibold select-none"
            )}
            // Black, on Tyler's call, 3 Sep 2026: the one bar that is not a
            // price, so it takes no price colour.
            style={{ borderColor: colors.foreground, color: colors.foreground }}
          >
            <GridMoveKnob
              tone="plain"
              onPointerDown={startPreviewGridDrag}
              onKeyDown={movePreviewGridFromKey}
              title="Drag to move the whole grid without changing the range's width."
            />
            <span className="min-w-0 truncate">DRAG GRID</span>
          </span>
        </BarRow>
      ) : null}
      {previewDrawn?.map((one) => {
        // The range's winning edge is not drawn on either grid: a line past
        // rung 1 with no name confused more than it explained (Tyler, 3 Sep
        // 2026). The drag maths still uses it. The band stops at the real rungs.
        if (one === null || one.line.kind === "edge") return null
        const { line, index, y, look, draggable } = one
        return (
          <ChartLine
            key={`grid-preview-${index}`}
            y={y}
            usdSlot={previewUsdSlot}
            usd={line.usd}
            colour={look.colour}
            name={one.chipOn === null ? one.name : null}
            rung={line.rung}
            rungSlot
            dashed={look.dashed}
            faded
            grip={draggable}
            onGripDown={one.onGripDown}
            title={one.title}
            action={
              <>
                {previewDrawn
                  .filter((other) => other !== null && other.chipOn === index)
                  .map((other) =>
                    other === null ? null : (
                      <NameChip
                        key={`grid-preview-chip-${other.index}`}
                        colour={other.look.colour}
                        name={other.name ?? ""}
                        grip={other.draggable}
                        onGripDown={other.onGripDown}
                        title={other.title}
                      />
                    )
                  )}
              </>
            }
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
 * What one named range line says on hover: what the rung there does, then
 * whether the line can be dragged and what dragging it does.
 */
function rangeLineTitle(
  direction: GridDirection,
  at: AtPrice | null,
  movable: boolean
): string {
  const what =
    at === null
      ? `The deepest ${entryWord(direction)} of the range.`
      : levelTitle(direction, at, at.holding !== null)
  if (at?.holding !== null && at?.holding !== undefined) {
    return `${what} An open entry stays fixed, so drag the other end instead.`
  }
  return movable
    ? `${what} Drag to move this end of the range. If one entry is open, its price stays fixed while the other prices spread out or pull in.`
    : `${what} This end is fixed because more than one entry is open, or an older range still holds coin.`
}

/** What one level line says on hover, in the words of the grid it belongs to. */
function levelTitle(
  direction: GridDirection,
  at: AtPrice,
  holding: boolean
): string {
  const price = formatPrice(at.px)
  const opens = entryWord(direction)
  const closes = exitSide(direction)
  // Where this level's way out sits: one step up on a buying grid, one step
  // down on a selling one.
  const exitWay = direction === "long" ? "above" : "below"
  if (at.dead) {
    return `Past your stop — it cannot ${opens} without the stop firing first. It wakes up if the stop moves clear of it.`
  }
  if (at.carried) {
    return `Opened at ${price}, then carried out of the range when it moved. It keeps its own ${closes} one step ${exitWay}, drawn as a dashed line, and is gone once that fills.`
  }
  if (holding) {
    return `Opened at ${price}. When its ${closes} one step ${exitWay} fills, a ${opens} goes back on here.`
  }
  return `Waiting to ${opens} ${price}. When it fills, a ${closes} goes on one step ${exitWay} — and when THAT fills, this ${opens} comes back at ${price}.`
}

/**
 * The money one level puts on its own line.
 *
 * A level that has bought shows what it is HOLDING at its own price. A level
 * still waiting shows the stake it will put in when it fills. `heldSz` and
 * `sz` are deliberately different numbers — `grid.ts` keeps them apart so a
 * part-filled sell shrinks what is left to sell without shrinking what the
 * next cycle may spend — so reading the wrong one is silent and wrong, not a
 * type error.
 *
 * Every line on the drawing reads this one function: the range rungs, a rung
 * carried from an older range, and the moving preview. It exists because they
 * did not. Until 3 Sep 2026 the range rungs used `sz` while the carried rung
 * and the preview used `heldSz`, so on a KuCoin BR grid one rung holding 149
 * coins printed $13.94, the stake of the 44 it was planned with, beside a
 * carried rung printing the $105 it really held. One pill cannot mean
 * "holding" on one line and "planned" on the next.
 */
function levelUsd(level: GridLevelState): number {
  return level.status === "holding"
    ? level.buyPx * level.heldSz
    : level.buyPx * level.sz
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
      one.usd = levelUsd(level)
      if (level.dead) one.dead = true
    } else {
      const one = slot(level.buyPx)
      one.holding = index
      one.usd = levelUsd(level)
    }
  }
  for (const level of plan.carriedLevels) {
    if (level.status !== "holding") continue
    const one = slot(level.buyPx)
    one.holding = -1
    one.carried = true
    one.usd += levelUsd(level)
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

// The stop's bar reads "SL", not "STOP LOSS" — Tyler, 3 Sep 2026 — so the
// money after it fits the fixed-width bar.
function gridStopName(
  plan: SmartGrid["plan"],
  stopPx: number,
  feesPaid: number | null
): string {
  if (feesPaid === null) return "SL —"
  return `SL ${formatSignedUsd(gridResultAt(plan, stopPx) - feesPaid)}`
}

/** Which grid control a drag is moving. */
type DragEnd = "top" | "bottom" | "whole" | "takeProfit" | "stopLoss"

/** The same handle before and after placement, so saving does not flash. */
function GridMoveKnob({
  disabled = false,
  onPointerDown,
  onKeyDown,
  title,
  tone,
}: {
  disabled?: boolean
  onPointerDown?: (event: React.PointerEvent) => void
  onKeyDown?: (event: React.KeyboardEvent) => void
  title: string
  /** On the grid's coloured badge, or on the preview's plain bar. */
  tone: "badge" | "plain"
}) {
  return (
    // The grip lives INSIDE the grid's options bar, first thing on it —
    // Tyler, 3 Sep 2026 — styled like the bar's other icon buttons.
    <button
      type="button"
      aria-label="Move the whole grid"
      aria-disabled={disabled}
      className={cn(
        "rounded p-0.5 focus-visible:outline-none",
        tone === "badge"
          ? "hover:bg-current/20 focus-visible:bg-current/20"
          : "hover:bg-accent focus-visible:bg-accent",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-ns-resize"
      )}
      style={{ touchAction: "none" }}
      onPointerDown={disabled ? undefined : onPointerDown}
      onKeyDown={disabled ? undefined : onKeyDown}
      title={title}
    >
      <GripVerticalIcon className="size-3" />
    </button>
  )
}

/**
 * The right-hand cluster of a line: what ChartLine draws, laid out the same
 * way for a row that has no line of its own. The bar sits where a name bar
 * sits, then the × slot, then the money column, so it lines up with the rungs.
 */
function BarRow({
  top,
  pointerEvents,
  usdSlot,
  rungSlot = false,
  children,
}: {
  top: number
  pointerEvents: "auto" | "none"
  usdSlot: number
  /** Leave room for the preview's rung-number column. */
  rungSlot?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute right-0 z-10 flex -translate-y-1/2 items-center gap-1"
      style={{ top, pointerEvents }}
    >
      <span style={{ minWidth: usdSlot }} />
      {rungSlot ? <span className="w-4" /> : null}
      {children}
    </div>
  )
}

/**
 * The fixed width of every bar on the grid, names and options alike: 112px,
 * about a tenth wider than a position's Entry pill — Tyler, 3 Sep 2026. A
 * name that does not fit is cut short with an ellipsis.
 */
const BAR_WIDTH = "w-28"

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
  onMoveRange: (grid: SmartGrid, move: GridRangeMove) => Promise<boolean>
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
  const wholeMovable = gridRangeReshapable(plan)
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
   * Dragging one of the grid's range or exit controls to a new price.
   *
   * The line follows the pointer while the button is down and only asks the
   * server when it is let go — a grid re-prices every level on a move, so doing
   * that on every pixel would be a hundred round trips per drag.
   */
  const startDrag =
    (which: DragEnd, from: number, toEdge?: (px: number) => number | null) =>
    (event: React.PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      // Measured once, here. The box cannot move mid-drag, and asking the
      // browser for it on every pixel forced a layout per mouse move.
      const top = measureTop()
      if (top === null) return
      const pointerFrom = priceFrom(event.clientY, top)
      if (pointerFrom === null) return
      // The price under the pointer, as the price the dragged line means. The
      // whole-grid grip moves by offset; a label sitting on a rung hands back
      // the range EDGE that puts the rung under the hand, via `toEdge`.
      const pxAt = (clientY: number): number | null => {
        const pointedPx = priceFrom(clientY, top)
        if (pointedPx === null) return null
        if (which === "whole") return from + pointedPx - pointerFrom
        return toEdge ? toEdge(pointedPx) : pointedPx
      }
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
          const px = pxAt(lastY)
          if (px !== null && px > 0) setDragging({ end: which, px })
        })
      }
      const onUp = (up: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        if (frame) cancelAnimationFrame(frame)
        const pointedPx = priceFrom(up.clientY, top)
        const px = pxAt(up.clientY)
        setDragging(null)
        if (px === null || !(px > 0)) return
        // A drag that ends where it started is a click, not a move.
        if (pointedPx !== null && Math.abs(pointerFrom - pointedPx) < 1e-9) {
          return
        }
        const rangeMove =
          which === "top" || which === "bottom" || which === "whole"
        if (rangeMove && !gridRangeAfterMove(plan, { end: which, px })) return
        // Shown where it was dropped from this moment on, so letting go looks
        // like the end of the move rather than the start of a wait.
        setPending({ end: which, px, was: savedFor(which) })
        const settled = rangeMove
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
        : end === "whole"
          ? (plan.topPx + plan.bottomPx) / 2
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
    if (
      dragging?.end === "top" ||
      dragging?.end === "bottom" ||
      dragging?.end === "whole"
    ) {
      return { end: dragging.end, px: dragging.px }
    }
    if (
      (pending?.end === "top" ||
        pending?.end === "bottom" ||
        pending?.end === "whole") &&
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
  // Is the range being moved right now — dragged, or dropped and waiting?
  const rangeMoved = shownTop !== plan.topPx || shownBottom !== plan.bottomPx

  /** A focused saved-grid handle moves one small screen step. */
  const moveWholeGridFromKey = (event: React.KeyboardEvent) => {
    if (
      !wholeMovable ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
      bandTop === null ||
      bandBottom === null
    ) {
      return
    }
    const top = measureTop()
    if (top === null) return
    const knobY = badgeY ?? (bandTop + bandBottom) / 2
    const here = priceFrom(top + knobY, top)
    const moved = priceFrom(
      top + knobY + (event.key === "ArrowUp" ? -8 : 8),
      top
    )
    if (here === null || moved === null) return
    const middle = (plan.topPx + plan.bottomPx) / 2
    const px = middle + moved - here
    if (!gridRangeAfterMove(plan, { end: "whole", px })) return
    event.preventDefault()
    setPending({ end: "whole", px, was: middle })
    void onMoveRange(grid, { end: "whole", px }).then((ok) => {
      if (!ok) setPending(null)
    })
  }

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
  // arithmetic the server does when it saves. A stop dragged to a price is
  // carried by a whole-grid move too, by the same dollars the two edges moved.
  const movedStop = !rangeMoved
    ? null
    : plan.stopLoss?.mode === "percent" && !plan.stopLoss.base
      ? gridStopBeyond(direction, shownRange, plan.stopLoss.underPct)
      : activeRangeMove?.end === "whole"
        ? gridStopAfterWholeMove(plan, shownRange)
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
   * The two rungs that carry the range's names.
   *
   * Rung 1 is the level nearest the market — the highest buy on a buying grid,
   * the lowest short on a selling one — and it sits one step INSIDE the
   * range's winning edge, because that edge is where rung 1 closes. The
   * deepest rung's own price IS the losing edge. The named lines sit on those
   * two rungs, so a line that says RUNG 1 is where rung 1 trades. Each is
   * drawn ONCE, as the named line carrying that level's money and its ×,
   * rather than as a range line and a level line stacked on one pixel.
   *
   * Rung 1 is picked by PRICE, not by position in the list, so nothing here
   * leans on how a saved plan happens to be ordered.
   */
  const nearSaved = plan.levels.reduce((best, level) =>
    direction === "long"
      ? level.buyPx > best.buyPx
        ? level
        : best
      : level.buyPx < best.buyPx
        ? level
        : best
  )
  // Rung 1's exit line, at the range's winning edge, only while rung 1 holds
  // and its exit is really resting there. A buying grid sells up at the top; a
  // selling grid buys back down at the bottom, and follows the buying grid's
  // pattern exactly: nothing at that edge before rung 1 trades (Tyler, 4 Sep
  // 2026).
  const drawRungOneExit = nearSaved.status === "holding" && nearSaved.heldSz > 0
  const rungOneExitPin = direction === "long" ? pinTop : pinBottom
  const rungOneExitName =
    direction === "long"
      ? "Rung 1 exit and move up"
      : "Rung 1 exit and move down"
  const rungOneExitTitle =
    direction === "long"
      ? "Rung 1 sells here. Once it sells, the grid moves up."
      : "Rung 1 buys back here. Once it buys back, the grid moves down."
  // Where each carried level closes. A carried level is a held rung the range
  // left behind when it moved. Its entry is drawn in the range's own list of
  // prices, but nothing drew its way out, so an open short below a selling
  // grid read as an exit rather than the trade still waiting to close (AZTEC,
  // Tyler, 4 Sep 2026). One line per price, holding every coin closing there.
  const carriedExits = (() => {
    const byPrice = new Map<string, { px: number; heldSz: number }>()
    for (const level of plan.carriedLevels) {
      if (level.status !== "holding" || !(level.heldSz > 0)) continue
      const key = priceKey(level.sellPx)
      const found = byPrice.get(key)
      if (found) found.heldSz += level.heldSz
      else byPrice.set(key, { px: level.sellPx, heldSz: level.heldSz })
    }
    return [...byPrice.values()]
  })()
  const carriedExitName =
    direction === "long"
      ? "Carried buy sells here"
      : "Carried short buys back here"
  const carriedExitTitle = (heldSz: number, px: number) =>
    direction === "long"
      ? `A buy carried from an older range sells its ${heldSz} coins here, at ${formatPrice(px)}. The level is gone once it sells.`
      : `A short carried from an older range buys back its ${heldSz} coins here, at ${formatPrice(px)}. The level is gone once it buys back.`
  // `gridLevels` hands the moving levels back lowest price first.
  const nearIndex = direction === "long" ? levelCount - 1 : 0
  const nearLevel =
    prices.find((at) => priceKey(at.px) === priceKey(nearSaved.buyPx)) ?? null
  const deepPx = lossEdge(direction, plan)
  const deepLevel =
    prices.find((at) => priceKey(at.px) === priceKey(deepPx)) ?? null
  // Where rung 1 is drawn: fixed if it is open, else wherever the moving range
  // puts it, else where the plan has it.
  const nearPx = movingLevels
    ? nearSaved.status === "holding"
      ? nearSaved.buyPx
      : movingLevels[nearIndex].buyPx
    : nearSaved.buyPx
  const upperPx = direction === "long" ? nearPx : shownTop
  const lowerPx = direction === "long" ? shownBottom : nearPx
  const upperLevel = direction === "long" ? nearLevel : deepLevel
  const lowerLevel = direction === "long" ? deepLevel : nearLevel
  const pinUpper = yPinned(upperPx)
  const pinLower = yPinned(lowerPx)
  // Both names are always drawn — pinned to the chart's edge with an arrow
  // when their own price has scrolled out of view — and dragging from there
  // still works. The one case that does not is both pinned to the SAME edge,
  // where the two labels land on the same pixel.
  const grippable =
    pinUpper !== null &&
    pinLower !== null &&
    !(pinUpper.off !== null && pinUpper.off === pinLower.off)
  /**
   * Dragging the label on rung 1 lands RUNG 1 under the hand, so the pointer's
   * price is turned into the range edge that puts it there, with the far edge
   * held. With one open entry as a fixed point the server re-spreads around
   * that entry instead, so the rung lands a little off the hand; rare, and the
   * range still moves the way it was pulled.
   */
  const nearToEdge = (px: number): number | null => {
    const range = gridRangeFromNearRung({
      rungPx: px,
      farPx: deepPx,
      levels: levelCount,
      spacing: plan.spacing,
      direction,
    })
    return range === null ? null : winEdge(direction, range)
  }
  const upperDrag =
    direction === "long"
      ? startDrag("top", plan.topPx, nearToEdge)
      : startDrag("top", plan.topPx)
  const lowerDrag =
    direction === "long"
      ? startDrag("bottom", plan.bottomPx)
      : startDrag("bottom", plan.bottomPx, nearToEdge)
  // Green when the grid buys the dips, red when it shorts the rallies. Every
  // line the grid owns — the range, its names, its badge — says which at a
  // glance.
  const rangeColour = direction === "long" ? colors.up : colors.down
  const cancelButton = (at: AtPrice | null) =>
    at?.entry != null ? (
      <button
        type="button"
        aria-label={`Cancel the ${entryWord(direction)} at ${formatPrice(at.px)}`}
        className="rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        style={{ pointerEvents: controls }}
        onClick={() =>
          onCancelLevel(grid.walletId, grid.id, at.entry as number)
        }
      >
        <XIcon className="size-3" />
      </button>
    ) : null
  const target = gridTakeProfitPx(plan)
  const targetY =
    shownTarget !== null
      ? yFor(shownTarget)
      : target === null
        ? null
        : yFor(target)

  const endTitle = `Reaching this closes everything the grid holds and ends it. Drag it anywhere ${direction === "long" ? "above" : "below"} the range.`
  const stopTitle = `Price cutting through this closes everything and ends the grid. ${
    feesPaid === null
      ? "The fills on hand do not cover the opening fees."
      : "The dollar figure takes off the opening fees already charged. The closing fee is known only after the order fills."
  } Drag it anywhere ${direction === "long" ? "below" : "above"} the current price — inside the range trails the stop, and the rungs past it go quiet until it moves clear again.`
  // A way out sitting on a named rung's own price shares that rung's row:
  // its bar goes to the LEFT of the rung's furniture instead of on top of it.
  const upperY = pinUpper?.y ?? null
  const lowerY = pinLower?.y ?? null
  // Before rung 1 trades, the grid has no order at its winning edge. End the
  // shade at rung 1 so the empty strip past it cannot look like another rung.
  // Once rung 1 is open, the band reaches its real exit and move line: the top
  // on a buying grid, the bottom on a selling grid.
  const drawnBandTop =
    direction === "long" && !drawRungOneExit ? upperY : bandTop
  const drawnBandBottom =
    direction === "short" && !drawRungOneExit ? lowerY : bandBottom
  const stopOnRow = sharesRow(stopY, lowerY)
    ? "lower"
    : sharesRow(stopY, upperY)
      ? "upper"
      : null
  const endOnRow = sharesRow(targetY, upperY)
    ? "upper"
    : sharesRow(targetY, lowerY)
      ? "lower"
      : null
  const stopChip =
    stop !== null && stopName !== null ? (
      <NameChip
        colour={colors.down}
        name={stopName}
        grip
        onGripDown={startDrag("stopLoss", stop)}
        title={stopTitle}
      />
    ) : null
  const endChip =
    target !== null ? (
      <NameChip
        colour={colors.warning}
        name="END GRID"
        grip
        onGripDown={startDrag("takeProfit", target)}
        title={endTitle}
      />
    ) : null
  // One money column for the whole grid, as wide as its widest chip. Every
  // line's figure comes from `prices`, including the ones drawn while the
  // range moves, so the column keeps one width from the first pixel of a drag
  // to the last.
  const usdSlot = Math.max(0, ...prices.map((at) => usdChipWidth(at.usd)))
  const sharedChips = (row: "upper" | "lower") => (
    <>
      {endOnRow === row ? endChip : null}
      {stopOnRow === row ? stopChip : null}
    </>
  )

  /**
   * The rungs drawn as plain lines while the range is moving: the ones between
   * the two named ends.
   *
   * The named lines are drawn separately, and while the range moves they land
   * on a rung's own price — rung 1's, and the deepest rung's, which IS the
   * losing edge. Drawing those two here as well would stack a second line and
   * a second money chip on the same row. A level called off by hand is left
   * out for the same reason it is when the range is still: it is gone for
   * good.
   */
  const movingMiddles =
    movingLevels?.flatMap((level, index) => {
      const saved = plan.levels[index]
      if (saved.status === "cancelled") return []
      const holding = saved.status === "holding"
      const px = holding ? saved.buyPx : level.buyPx
      const key = priceKey(px)
      if (key === priceKey(upperPx) || key === priceKey(lowerPx)) return []
      return [{ key: `moving-${index}`, px, saved, holding }]
    }) ?? null

  /**
   * Where the grip and the badge go: the middle between UPPER PRICE and LOWER
   * PRICE, flush right. When that middle lands on a rung's line, the pair
   * joins that rung's row, in front of its × and money, rather than covering
   * them.
   */
  const badgeY =
    upperY !== null && lowerY !== null ? (upperY + lowerY) / 2 : null
  const knobRow = (() => {
    if (badgeY === null) return null
    const lines = movingMiddles
      ? movingMiddles.map((one) => ({ key: one.key, y: yFor(one.px) }))
      : prices
          .filter((at) => at !== deepLevel && at !== nearLevel)
          .map((at) => ({ key: priceKey(at.px), y: yFor(at.px) }))
    return lines.find((one) => sharesRow(one.y, badgeY))?.key ?? null
  })()
  const optionsBar = (
    <span
      // The options bar: the same fixed width as every name bar, with the
      // whole-grid grip first — Tyler, 3 Sep 2026.
      className={cn(
        BAR_WIDTH,
        "flex items-center justify-between gap-0.5 rounded-sm px-1 py-0.5 text-xs font-semibold"
      )}
      style={{
        backgroundColor: rangeColour,
        color: colors.badgeText,
        pointerEvents: controls,
      }}
      // Says what the grid is doing rather than assuming a buy.
      title={`${walletName(grid.walletId)} — ${GRID_DIRECTION_LABELS[direction].toLowerCase()}${plan.reversedFrom ? ", continuing a reversed grid on this range" : ""}. ${waiting} waiting, ${holding} holding${plan.cycles > 0 ? `, ${plan.cycles} round trips` : ""}.`}
    >
      <GridMoveKnob
        tone="badge"
        disabled={!wholeMovable}
        onPointerDown={startDrag("whole", (plan.topPx + plan.bottomPx) / 2)}
        onKeyDown={moveWholeGridFromKey}
        title={
          wholeMovable
            ? "Drag to move the whole grid without changing the range's width."
            : "The whole grid can move once it is holding no coin. An open entry stays at the price it actually paid."
        }
      />
      <span>
        {waiting}/{plan.levels.length}
      </span>
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
          aria-label={`Stop the grid trading — cancel every waiting ${entryWord(direction)}`}
          className="rounded p-0.5 hover:bg-current/20 focus-visible:bg-current/20 focus-visible:outline-none"
          onClick={() => onCancelGrid(grid)}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  )
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
      {drawnBandTop !== null &&
      drawnBandBottom !== null &&
      drawnBandBottom > drawnBandTop ? (
        <>
          <div
            className="absolute inset-x-0"
            style={{
              top: drawnBandTop,
              height: drawnBandBottom - drawnBandTop,
              backgroundColor: rangeColour,
              opacity: dragging ? 0.1 : 0.05,
            }}
          />
          {knobRow === null && badgeY !== null ? (
            <BarRow top={badgeY} pointerEvents={controls} usdSlot={usdSlot}>
              {optionsBar}
            </BarRow>
          ) : null}
        </>
      ) : null}

      {/* The levels between the ends: a thin line and a price, nothing more.
          Green where the grid buys, red where it sells — the two things you
          actually want to tell apart at a glance. */}
      {/* While the range is moving, the levels it WOULD have — plain lines with
          their money, since they are not yet anything to cancel. */}
      {movingMiddles?.map(({ key, px, saved, holding }) => {
        const y = yFor(px)
        if (y === null) return null
        return (
          <ChartLine
            key={key}
            y={y}
            usdSlot={usdSlot}
            nameNode={knobRow === key ? optionsBar : undefined}
            // What a rung puts in is its share of the account, set by Share of
            // account and the split. The price decides how many coins that
            // buys, never how many dollars, so the figure holds still while
            // the range is dragged. Blanking it left every waiting rung
            // looking empty mid-drag (Tyler, 4 Sep 2026).
            usd={levelUsd(saved)}
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
        .filter((at) => at !== deepLevel && at !== nearLevel)
        .map((at) => {
          const y = yFor(at.px)
          if (y === null) return null
          const holding = at.holding !== null
          return (
            <ChartLine
              key={priceKey(at.px)}
              y={y}
              usdSlot={usdSlot}
              nameNode={knobRow === priceKey(at.px) ? optionsBar : undefined}
              usd={at.usd}
              colour={sideColour(
                holding ? exitSide(direction) : entrySide(direction)
              )}
              name={null}
              dashed={at.dead}
              faded={at.dead}
              title={levelTitle(direction, at, holding)}
              cancel={cancelButton(at)}
            />
          )
        })}

      {drawRungOneExit && rungOneExitPin ? (
        <ChartLine
          y={rungOneExitPin.y}
          usdSlot={usdSlot}
          colour={sideColour(exitSide(direction))}
          name={null}
          nameNode={
            <NameChip
              colour={sideColour(exitSide(direction))}
              name={rungOneExitName}
              className="w-auto shrink-0 whitespace-nowrap"
              title={rungOneExitTitle}
            />
          }
          dashed={rungOneExitPin.off !== null}
          title={rungOneExitTitle}
        />
      ) : null}

      {carriedExits.map(({ px, heldSz }) => {
        const y = yFor(px)
        if (y === null) return null
        return (
          <ChartLine
            key={`carried-exit-${priceKey(px)}`}
            y={y}
            usdSlot={usdSlot}
            usd={px * heldSz}
            colour={sideColour(exitSide(direction))}
            name={null}
            nameNode={
              <NameChip
                colour={sideColour(exitSide(direction))}
                name={carriedExitName}
                className="w-auto shrink-0 whitespace-nowrap"
                title={carriedExitTitle(heldSz, px)}
              />
            }
            dashed
            title={carriedExitTitle(heldSz, px)}
          />
        )
      })}

      {/* The two named rungs. One open level stays fixed while these
          compress or expand the other prices around it. */}
      {pinLower ? (
        <ChartLine
          y={pinLower.y}
          usdSlot={usdSlot}
          usd={lowerLevel?.usd}
          colour={rangeColour}
          name={gridBoundaryName("bottom")}
          dashed={pinLower.off !== null}
          grip={bottomMovable && grippable}
          onGripDown={bottomMovable ? lowerDrag : undefined}
          title={rangeLineTitle(direction, lowerLevel, bottomMovable)}
          action={sharedChips("lower")}
          cancel={cancelButton(lowerLevel)}
        />
      ) : null}
      {pinUpper ? (
        <ChartLine
          y={pinUpper.y}
          usdSlot={usdSlot}
          usd={upperLevel?.usd}
          colour={rangeColour}
          name={gridBoundaryName("top")}
          dashed={pinUpper.off !== null}
          grip={topMovable && grippable}
          onGripDown={topMovable ? upperDrag : undefined}
          title={rangeLineTitle(direction, upperLevel, topMovable)}
          cancel={cancelButton(upperLevel)}
          action={sharedChips("upper")}
        />
      ) : null}

      {/* The two ways out. Orange ends the grid and red is the loss limit,
          whichever side of the range each one sits. A way out sitting on a
          named rung's price has already lent that row its bar; only its
          line is drawn here. */}
      {targetY !== null && target !== null ? (
        <ChartLine
          y={targetY}
          usdSlot={usdSlot}
          colour={colors.warning}
          name={endOnRow ? null : "END GRID"}
          dashed={false}
          grip
          onGripDown={startDrag("takeProfit", target)}
          title={endTitle}
        />
      ) : null}
      {stopY !== null && stop !== null && stopName !== null ? (
        <ChartLine
          y={stopY}
          usdSlot={usdSlot}
          colour={colors.down}
          name={stopOnRow ? null : stopName}
          dashed={false}
          grip
          onGripDown={startDrag("stopLoss", stop)}
          title={stopTitle}
        />
      ) : null}
    </>
  )
}

/**
 * The two range names. Each sits on a rung's own price — rung 1 nearest the
 * market, the deepest rung at the far end — and says only which end it is.
 * They used to add "RUNG 1 BUYS" / "RUNG 3 SHORTS"; Tyler had the rung words
 * removed on 3 Sep 2026.
 */
function gridBoundaryName(end: "top" | "bottom"): string {
  return end === "top" ? "UPPER PRICE" : "LOWER PRICE"
}

/** What each kind of line looks like and what it is called. */
function lineLook(
  kind: GridPreview["lines"][number]["kind"],
  colors: ChartColors,
  direction: GridDirection
): { colour: string; name: string | null; dashed: boolean } {
  // The grid's own colour: green buying the dips, red shorting the rallies.
  const rangeColour = direction === "long" ? colors.up : colors.down
  if (kind === "upper") {
    return {
      colour: rangeColour,
      name: gridBoundaryName("top"),
      dashed: false,
    }
  }
  if (kind === "lower") {
    return {
      colour: rangeColour,
      name: gridBoundaryName("bottom"),
      dashed: false,
    }
  }
  // The preview's winning edge stays unnamed and undrawn. The placed grid
  // decides whether to show that line from rung 1's live state.
  if (kind === "edge") {
    return { colour: rangeColour, name: null, dashed: false }
  }
  // Orange, so the line that ends the grid is never read as a level or a win.
  if (kind === "takeProfit") {
    return { colour: colors.warning, name: "END GRID", dashed: false }
  }
  if (kind === "stopLoss") {
    return { colour: colors.down, name: "SL", dashed: false }
  }
  // Where the exchange would take the whole trade. Dashed, because it is not
  // an order anybody placed — it is what the borrowing costs if it all fills.
  if (kind === "liquidation") {
    return { colour: colors.down, name: "LIQUIDATION", dashed: true }
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
 * The four lines you set get a name. Rung 1's exit gets one while Rung 1 is
 * open, whichever way the grid runs, and so does the way out of a carried
 * level. The levels in between stay unnamed, because a dozen labelled ones is
 * a wall of text over the price action. UPPER PRICE and LOWER PRICE sit on the
 * first and last rung, so those two lines carry a name AND the rung's money
 * and ×.
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
  cancel,
  usdSlot,
  nameNode,
  rung,
  rungSlot = false,
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
  /** The grid's own controls, or another line's name sharing this row. */
  action?: React.ReactNode
  /** This rung's ×. After the money chip, so it reads as "this buy, off". */
  cancel?: React.ReactNode
  /**
   * Width reserved for the money chip at the far right of every line of one
   * grid, in pixels, so the amounts stack in one straight column against the
   * plot's edge and the name bars line up against that column. Tyler, 3 Sep
   * 2026: "aligned right, all the way to the right".
   */
  usdSlot?: number
  /** Something drawn where the name bar goes, on a line that has no name. */
  nameNode?: React.ReactNode
  /**
   * The rung's number, 1 nearest the market. Only the preview prints them
   * (Tyler, 3 Sep 2026); a placed grid shows none. `rungSlot` keeps the
   * column on the preview's lines that have no number, so they line up.
   */
  rung?: number
  rungSlot?: boolean
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
      {/* Left to right: the grid's controls, this rung's ×, its money, the
          preview's rung number, then the bar LAST, flush against the plot's
          right edge — Tyler, 3 Sep 2026, so the grip on the options bar sits
          at the edge. The money column is one width on every line, so the
          amounts stack straight and the bars line up against them. */}
      <div className="absolute top-0 right-0 flex -translate-y-1/2 items-center gap-1">
        {action}
        {cancel}
        <span
          className="flex justify-end"
          style={usdSlot !== undefined ? { minWidth: usdSlot } : undefined}
        >
          {usd !== undefined && usd > 0 ? (
            <span className="rounded-sm bg-muted px-1 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {formatUsdRounded(usd)}
            </span>
          ) : null}
        </span>
        {rungSlot ? (
          <span className="w-4 text-center text-xs font-medium text-muted-foreground tabular-nums">
            {rung}
          </span>
        ) : null}
        {name ? (
          <NameChip
            colour={colour}
            name={name}
            grip={grip}
            onGripDown={onGripDown}
            title={title}
          />
        ) : (
          // A line with no bar keeps a bar's worth of room, so its money
          // stays in the column with everyone else's.
          (nameNode ??
          (usdSlot !== undefined ? <span className={BAR_WIDTH} /> : null))
        )}
      </div>
    </div>
  )
}

/**
 * How wide a money chip is, for the shared column. On the generous side on
 * purpose: the chip is right-aligned inside the slot, so a slot a little too
 * wide costs nothing, while a slot narrower than the chip lets that one line's
 * name bar step out of line with the others by the difference.
 */
function usdChipWidth(usd: number): number {
  return formatUsdRounded(usd).length * 8 + 10
}

/**
 * A named line's white bar. Usually drawn by its own line; when two named
 * lines land on the same price — a stop 0% under the bottom, an End Grid on
 * the top — the second bar would sit on top of the first and hide half of
 * it, so it is drawn on the first line's row instead, to the left, still
 * draggable.
 */
function NameChip({
  colour,
  name,
  className,
  grip,
  onGripDown,
  title,
}: {
  colour: string
  name: string
  className?: string
  grip?: boolean
  onGripDown?: (event: React.PointerEvent) => void
  title?: string
}) {
  return (
    <span
      // One width for the four bars Tyler sets, so UPPER PRICE, LOWER PRICE,
      // END GRID and SL all start and end on the same x. Rung 1's conditional
      // exit passes its own width so its instruction is never cut short.
      className={cn(
        BAR_WIDTH,
        "flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 text-xs font-semibold select-none",
        grip && "cursor-ns-resize",
        className
      )}
      style={{
        borderColor: colour,
        color: colour,
        // The layer itself takes no pointer events, so a line that is meant
        // to be dragged has to switch them back on for its own label. Without
        // this the handle is drawn, shows a resize cursor, and does nothing
        // at all when you press it.
        pointerEvents: grip ? "auto" : "none",
        touchAction: "none",
      }}
      onPointerDown={onGripDown}
      title={title}
    >
      {grip ? (
        <GripVerticalIcon className="size-3 shrink-0 opacity-70" />
      ) : null}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}

/** Two lines closer than a label is tall would stack their bars. */
const LABEL_HEIGHT = 16
function sharesRow(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.abs(a - b) < LABEL_HEIGHT
}
