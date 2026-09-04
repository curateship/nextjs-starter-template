import * as React from "react"
import {
  ArrowUpDownIcon,
  GripVerticalIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import type { ChartSurface } from "@/components/trade/price-chart"
import type { DcaPreview } from "@/components/trade/smart-order-dialog"
import {
  exitLadderGapPctForPrice,
  exitLadderLevels,
  exitLadderPlannedSz,
  ladderExitLevels,
  ladderShapeMovable,
} from "@/lib/trade/dca"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import type { TradeOrder } from "@/lib/trade/paper"
import {
  formatPrice,
  formatSignedUsd,
  formatUsdRounded,
} from "@/lib/trade/format"
import type { ChartColors } from "@/lib/trade/chart-theme"
import { cn } from "@/lib/utils"

/**
 * A placed DCA ladder, drawn over the candles — and, while the placement
 * window is open, the faint preview of the one being set up.
 *
 * The rungs are drawn from the ladder's own record rather than from the order
 * rows, because not every rung has an order: a rung under the stop is alive
 * but off the book, and a two-green rung never rests one at all. Each state
 * says what it is — waiting, watching, or faded out under the stop — and a
 * waiting rung's × calls just that rung off. Placed prices stay frozen. The
 * preview is different: before Place is pressed, a rung moves the whole shape
 * and the deepest rung also carries the handle that spreads the gaps.
 *
 * **`readOnly` drops the buttons and keeps the drawing.** The live-run
 * dashboard shows the same ladder on the same candles and has nothing to act
 * with — its job is to report, and a × there would be a way to call off a real
 * rung from a page that is supposed to be a record.
 *
 * The ladder's control tag exists only before anything buys. It sits below the
 * last visible rung as a footer for the complete ladder, rather than covering
 * a priced ladder level. The anchor may also be Exit 1, but that line belongs
 * to the exit rather than to the summary. The moment the first rung buys, the
 * controls fold into the position's own entry pill
 * ("Entry · DCA ladder: 2 waiting ⚙ ×", built by the trade-lines layer).
 */

/**
 * The same tag every line on this chart wears: an outlined pill in the line's
 * own colour, on the chart's own background.
 *
 * Matched to the position and order lines deliberately. They were solid blocks
 * of colour with white words while those were outlines, so two things that are
 * both "a price this trade cares about" looked like two different kinds of
 * object — and a solid tag that wide hides the candles behind it.
 */
const TAG_CLASS =
  "absolute right-1 top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border bg-card/90 px-1.5 py-0.5 text-xs font-semibold"

/** One label row of breathing room between the deepest rung and its footer. */
const LADDER_SUMMARY_GAP = 28
const LADDER_SUMMARY_EDGE_INSET = 14

function ladderSummaryY(
  rungs: readonly { px: number }[],
  yFor: (price: number) => number | null,
  chartHeight: number
): number | null {
  const shown = rungs
    .map((rung) => yFor(rung.px))
    .filter((y): y is number => y !== null)
  if (shown.length === 0) return null
  const bottomRung = Math.max(...shown)
  return Math.min(
    bottomRung + LADDER_SUMMARY_GAP,
    Math.max(LADDER_SUMMARY_EDGE_INSET, chartHeight - LADDER_SUMMARY_EDGE_INSET)
  )
}

export const SmartLadderLayer = React.memo(function SmartLadderLayer({
  surface,
  colors,
  marketKey,
  ladders,
  orders = [],
  preview,
  tool,
  readOnly = false,
  walletName,
  onCancelRung,
  onCancelLadder,
  onOpenSettings,
  onReshapeLadder,
}: {
  surface: ChartSurface
  colors: ChartColors
  marketKey: string | null
  /** Every live ladder, whichever wallet holds it; this market's are drawn. */
  ladders: readonly SmartLadder[]
  /** Resting orders supply the price the exchange is actually working. */
  orders?: readonly Pick<TradeOrder, "id" | "px">[]
  /** The placement window's rung prices as edited, or null when it is shut. */
  preview: DcaPreview | null
  /** A paint tool in hand takes the pointer; these controls step aside. */
  tool: string | null
  /** Draw the ladder, offer nothing to press. */
  readOnly?: boolean
  walletName: (walletId: string) => string
  onCancelRung?: (walletId: string, ladderId: string, rungIndex: number) => void
  onCancelLadder?: (ladder: SmartLadder) => void
  onOpenSettings?: (ladder: SmartLadder, anchor: Element) => void
  onReshapeLadder?: (
    ladder: SmartLadder,
    shape:
      | { anchorPx: number }
      | { deepestPx: number }
      | { exitIndex: number; exitPx: number }
  ) => Promise<boolean>
}) {
  const shown = ladders.filter((ladder) => ladder.marketKey === marketKey)

  const yFor = (price: number): number | null => {
    const y = surface.yOf(price)
    if (y === null || y < 0 || y > surface.height) return null
    return y
  }

  const layerRef = React.useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={layerRef}
      className="absolute inset-0"
      style={{ pointerEvents: "none", width: surface.width }}
    >
      {preview ? (
        <PreviewLines
          preview={preview}
          colors={colors}
          yFor={yFor}
          tool={tool}
          measureTop={() =>
            layerRef.current?.getBoundingClientRect().top ?? null
          }
          priceFrom={(clientY, top) => surface.priceAt(clientY - top)}
        />
      ) : null}

      {shown.map((ladder) => (
        <LadderLines
          key={ladder.id}
          ladder={ladder}
          orders={orders}
          colors={colors}
          yFor={yFor}
          chartHeight={surface.height}
          tool={tool}
          readOnly={readOnly}
          walletName={walletName}
          onCancelRung={onCancelRung}
          onCancelLadder={onCancelLadder}
          onOpenSettings={onOpenSettings}
          onReshapeLadder={onReshapeLadder}
          measureTop={() =>
            layerRef.current?.getBoundingClientRect().top ?? null
          }
          priceFrom={(clientY, top) => surface.priceAt(clientY - top)}
        />
      ))}
    </div>
  )
})

type PreviewDrag = {
  kind: "move" | "resize" | "exit"
  rungIndex: number
  pointerPx: number
}

const DRAG_SLOP = 3

/** A movable ladder shape, either in the placement preview or still untouched. */
function PreviewLines({
  preview,
  colors,
  yFor,
  tool,
  measureTop,
  priceFrom,
  placed = false,
  onCancelRung,
  summary,
  chartHeight,
}: {
  preview: DcaPreview
  colors: ChartColors
  yFor: (price: number) => number | null
  tool: string | null
  measureTop: () => number | null
  priceFrom: (clientY: number, top: number) => number | null
  placed?: boolean
  onCancelRung?: (rungIndex: number) => void
  /** The placed ladder's whole-ladder controls, drawn after its last rung. */
  summary?: React.ReactNode
  chartHeight?: number
}) {
  const [dragging, setDragging] = React.useState<PreviewDrag | null>(null)
  const activeDragCleanup = React.useRef<() => void>(() => undefined)

  React.useEffect(() => () => activeDragCleanup.current(), [])

  const shownRungs = React.useMemo(() => {
    if (!dragging) return preview.rungs
    if (dragging.kind === "exit") return preview.rungs
    if (dragging.kind === "move") {
      const grabbed = preview.rungs[dragging.rungIndex]
      if (!grabbed || !(grabbed.px > 0) || !(dragging.pointerPx > 0)) {
        return preview.rungs
      }
      const scale = dragging.pointerPx / grabbed.px
      return preview.rungs.map((rung) => ({ ...rung, px: rung.px * scale }))
    }

    const deepest = preview.rungs.at(-1)
    if (
      !deepest ||
      !(preview.anchorPx > deepest.px) ||
      !(preview.anchorPx > dragging.pointerPx) ||
      !(dragging.pointerPx > 0)
    ) {
      return preview.rungs
    }
    const scale =
      Math.log(dragging.pointerPx / preview.anchorPx) /
      Math.log(deepest.px / preview.anchorPx)
    if (!Number.isFinite(scale) || !(scale > 0)) return preview.rungs
    return preview.rungs.map((rung) => ({
      ...rung,
      px: preview.anchorPx * (rung.px / preview.anchorPx) ** scale,
    }))
  }, [dragging, preview])

  const shownAnchorPx = React.useMemo(() => {
    if (!dragging || dragging.kind !== "move") return preview.anchorPx
    const grabbed = preview.rungs[dragging.rungIndex]
    if (!grabbed || !(grabbed.px > 0) || !(dragging.pointerPx > 0)) {
      return preview.anchorPx
    }
    return preview.anchorPx * (dragging.pointerPx / grabbed.px)
  }, [dragging, preview])

  const shownExitLevels = React.useMemo(() => {
    const previewGap = preview.exitGapPct ?? null
    if (previewGap === null) return []
    let exitGapPct = previewGap
    if (dragging?.kind === "exit") {
      const moved = exitLadderGapPctForPrice(
        { anchorPx: shownAnchorPx, rungs: shownRungs },
        dragging.rungIndex,
        dragging.pointerPx
      )
      if (moved !== null) exitGapPct = moved
    }
    return exitLadderLevels({
      anchorPx: shownAnchorPx,
      rungs: shownRungs,
      takeProfit: { mode: "exitLadder", exitGapPct },
    })
  }, [dragging, preview.exitGapPct, shownAnchorPx, shownRungs])

  const startDrag =
    (kind: PreviewDrag["kind"], rungIndex: number) =>
    (event: React.PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      if (dragging) return
      const top = measureTop()
      if (top === null) return

      activeDragCleanup.current()
      let frame = 0
      const fromY = event.clientY
      let lastY = event.clientY
      const update = () => {
        frame = 0
        const px = priceFrom(lastY, top)
        if (px !== null && px > 0) {
          setDragging({ kind, rungIndex, pointerPx: px })
        }
      }
      const onMove = (move: PointerEvent) => {
        lastY = move.clientY
        if (!frame) frame = requestAnimationFrame(update)
      }
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onCancel)
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        activeDragCleanup.current = () => undefined
      }
      const onCancel = () => {
        cleanup()
        setDragging(null)
      }
      const onUp = (up: PointerEvent) => {
        cleanup()
        if (Math.abs(up.clientY - fromY) < DRAG_SLOP) {
          setDragging(null)
          return
        }
        const px = priceFrom(up.clientY, top)
        if (px === null || !(px > 0)) {
          setDragging(null)
          return
        }
        setDragging({ kind, rungIndex, pointerPx: px })
        let result: void | Promise<boolean>
        if (kind === "exit") {
          if (
            !preview.onMoveExit ||
            exitLadderGapPctForPrice(
              { anchorPx: preview.anchorPx, rungs: preview.rungs },
              rungIndex,
              px
            ) === null
          ) {
            setDragging(null)
            return
          }
          result = preview.onMoveExit(rungIndex, px)
        } else if (kind === "resize") {
          if (!(px < preview.anchorPx)) {
            setDragging(null)
            return
          }
          result = preview.onResize(px)
        } else {
          const grabbed = preview.rungs[rungIndex]
          if (!grabbed || !(grabbed.px > 0)) {
            setDragging(null)
            return
          }
          const anchorPx = preview.anchorPx * (px / grabbed.px)
          result = preview.onMove(anchorPx)
        }
        void Promise.resolve(result).finally(() => {
          setDragging(null)
        })
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onCancel)
      activeDragCleanup.current = cleanup
    }

  const controls = tool ? "none" : "auto"
  const deepestIndex = shownRungs.length - 1
  const summaryY =
    summary && chartHeight !== undefined
      ? ladderSummaryY(shownRungs, yFor, chartHeight)
      : null

  return (
    <>
      {shownRungs.map((rung, index) => {
        const y = yFor(rung.px)
        if (y === null) return null
        return (
          <div
            key={`preview-${index}`}
            className="absolute inset-x-0"
            style={{ top: y }}
          >
            <div
              className={cn(
                "border-t border-dashed",
                placed ? "opacity-100" : "opacity-40"
              )}
              style={{ borderColor: colors.up }}
            />
            <span
              className={cn(
                TAG_CLASS,
                "tabular-nums",
                placed ? "opacity-100" : "opacity-80"
              )}
              style={{
                borderColor: colors.up,
                color: colors.up,
                pointerEvents: controls,
              }}
              data-order-frame-control
            >
              <button
                type="button"
                className="flex cursor-ns-resize items-center gap-0.5 rounded focus-visible:outline-none"
                aria-label={`Move the whole DCA ladder from rung ${index + 1}`}
                title="Drag to move the whole DCA ladder"
                onPointerDown={startDrag("move", index)}
              >
                <GripVerticalIcon className="size-3" />
                Rung {index + 1} · {formatUsdRounded(rung.dollars)}
              </button>
              {index === deepestIndex ? (
                <button
                  type="button"
                  className="cursor-ns-resize rounded p-0.5 hover:bg-current/15 focus-visible:bg-current/15 focus-visible:outline-none"
                  aria-label="Expand or contract the DCA ladder"
                  title="Drag to spread the rungs apart or bring them closer"
                  onPointerDown={startDrag("resize", index)}
                >
                  <ArrowUpDownIcon className="size-3" />
                </button>
              ) : null}
              {placed && onCancelRung ? (
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-current/15 focus-visible:bg-current/15 focus-visible:outline-none"
                  aria-label={`Cancel rung ${index + 1}`}
                  onClick={() => onCancelRung(index)}
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
            </span>
          </div>
        )
      })}

      {shownExitLevels.map((px, index) => {
        const y = yFor(px)
        if (y === null) return null
        const sourceRungIndex = shownRungs.length - 1 - index
        const sourceRung = shownRungs[sourceRungIndex]
        const sourceSz = sourceRung ? sourceRung.dollars / sourceRung.px : 0
        const profit = sourceRung ? (px - sourceRung.px) * sourceSz : 0
        return (
          <div
            key={`preview-exit-${index}`}
            className="absolute inset-x-0 opacity-40"
            style={{ top: y }}
          >
            <div
              className="border-t border-dashed"
              style={{ borderColor: colors.up }}
            />
            <span
              className={cn(TAG_CLASS, "tabular-nums opacity-80")}
              style={{
                borderColor: colors.up,
                color: colors.up,
                pointerEvents: controls,
              }}
              data-order-frame-control
            >
              <button
                type="button"
                className="flex cursor-ns-resize items-center gap-0.5 rounded focus-visible:outline-none"
                aria-label={`Move the whole exit ladder from rung ${sourceRungIndex + 1}'s exit`}
                title="Drag to move every exit and change the gap above the buys"
                onPointerDown={startDrag("exit", index)}
              >
                <GripVerticalIcon className="size-3" />
                Exit rung {sourceRungIndex + 1} for profit at{" "}
                {formatSignedUsd(profit)}
              </button>
            </span>
          </div>
        )
      })}

      {summaryY !== null ? (
        <div
          data-dca-ladder-summary
          className="absolute inset-x-0"
          style={{ top: summaryY }}
        >
          {summary}
        </div>
      ) : null}
    </>
  )
}

function LadderLines({
  ladder,
  orders,
  colors,
  yFor,
  chartHeight,
  tool,
  readOnly,
  walletName,
  onCancelRung,
  onCancelLadder,
  onOpenSettings,
  onReshapeLadder,
  measureTop,
  priceFrom,
}: {
  ladder: SmartLadder
  orders: readonly Pick<TradeOrder, "id" | "px">[]
  colors: ChartColors
  yFor: (price: number) => number | null
  chartHeight: number
  tool: string | null
  readOnly: boolean
  walletName: (walletId: string) => string
  onCancelRung?: (walletId: string, ladderId: string, rungIndex: number) => void
  onCancelLadder?: (ladder: SmartLadder) => void
  onOpenSettings?: (ladder: SmartLadder, anchor: Element) => void
  onReshapeLadder?: (
    ladder: SmartLadder,
    shape:
      | { anchorPx: number }
      | { deepestPx: number }
      | { exitIndex: number; exitPx: number }
  ) => Promise<boolean>
  measureTop: () => number | null
  priceFrom: (clientY: number, top: number) => number | null
}) {
  const plan = ladder.plan
  const waiting = plan.rungs.filter((rung) => rung.status === "waiting").length
  const bought = plan.rungs.some(
    (rung) => rung.status === "filled" || rung.status === "sold"
  )
  const exits = ladderExitLevels(plan)
  const orderPrices = new Map(orders.map((order) => [order.id, order.px]))
  const mirroredExits =
    plan.takeProfit?.mode === "exitLadder" ? exitLadderLevels(plan) : []
  const shapeMoves =
    !readOnly && onReshapeLadder !== undefined && ladderShapeMovable(plan)
  // While a paint tool is held, these controls must not steal its presses.
  const controls = tool || readOnly ? "none" : "auto"
  const visibleRungs = plan.rungs.filter(
    (rung) => rung.status === "waiting" || rung.status === "skipped"
  )
  const settledSummaryY = ladderSummaryY(visibleRungs, yFor, chartHeight)

  // Whole-ladder controls sit after the final rung instead of covering the
  // anchor. In exit-ladder mode the anchor is Exit 1, and the exit line already
  // owns that price. After the first buy, the position entry carries them.
  const summary = bought ? null : (
    <span
      className={TAG_CLASS}
      style={{
        borderColor: colors.up,
        color: colors.up,
        pointerEvents: controls,
      }}
      title={`${walletName(ladder.walletId)} — the ladder hangs from ${formatPrice(plan.anchorPx)}.${shapeMoves ? " Drag any rung to move it, or use the deepest rung's resize handle." : " Rung prices are frozen after the ladder starts buying."}`}
    >
      DCA ladder{waiting > 0 ? ` · ${waiting} waiting` : ""}
      {readOnly ? null : (
        <button
          type="button"
          aria-label="Change the ladder settings"
          className="rounded p-0.5 hover:bg-current/15 focus-visible:bg-current/15 focus-visible:outline-none"
          onClick={(event) => onOpenSettings?.(ladder, event.currentTarget)}
        >
          <SettingsIcon className="size-3" />
        </button>
      )}
      {waiting > 0 && !readOnly ? (
        <button
          type="button"
          aria-label="Stop buying deeper — cancel every waiting rung"
          className="rounded p-0.5 hover:bg-current/15 focus-visible:bg-current/15 focus-visible:outline-none"
          onClick={() => onCancelLadder?.(ladder)}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  )

  return (
    <>
      {shapeMoves ? (
        <PreviewLines
          preview={{
            anchorPx: plan.anchorPx,
            rungs: plan.rungs.map((rung) => ({
              px: rung.px,
              dollars: rung.px * rung.sz,
            })),
            onMove: (anchorPx) =>
              onReshapeLadder?.(ladder, { anchorPx }) ?? false,
            onResize: (deepestPx) =>
              onReshapeLadder?.(ladder, { deepestPx }) ?? false,
          }}
          colors={colors}
          yFor={yFor}
          tool={tool}
          placed
          onCancelRung={(index) =>
            onCancelRung?.(ladder.walletId, ladder.id, index)
          }
          summary={summary}
          chartHeight={chartHeight}
          measureTop={measureTop}
          priceFrom={priceFrom}
        />
      ) : (
        plan.rungs.map((rung, index) => {
          // A skipped rung stays on the chart, faded, rather than disappearing:
          // five buys were asked for, and one quietly going away with nothing
          // said is the one thing this must never do.
          //
          // **The word is "skipped" and it is the same word everywhere.** The
          // plan, the schema and the toast that placed the ladder all say
          // skipped; this tag used to say "missed", which read as a second thing
          // that could happen to a rung.
          const skipped = rung.status === "skipped"
          if (rung.status !== "waiting" && !skipped) return null
          const y = yFor(rung.px)
          if (y === null) return null
          return (
            <div
              key={`rung-${index}`}
              className={cn(
                "absolute inset-x-0",
                (rung.dead || skipped) && "opacity-40"
              )}
              style={{ top: y }}
            >
              <div
                className="border-t border-dashed"
                style={{ borderColor: colors.up }}
              />
              <span
                className={TAG_CLASS}
                style={{
                  borderColor: colors.up,
                  color: colors.up,
                  pointerEvents: controls,
                }}
                title={
                  skipped
                    ? "This rung never bought — price reached it while the cash was already spent, or passed it while it sat under your stop. It will not buy now."
                    : rung.dead
                      ? "Below your stop — if the stop hits, this rung is cancelled without buying. It wakes up if the stop moves back down."
                      : plan.twoGreen
                        ? rung.touched
                          ? "Price has reached this rung — it buys at market once two green candles in a row confirm."
                          : "Watching — nothing rests on the book until price reaches it and two green candles confirm."
                        : readOnly
                          ? "A waiting rung — nothing rests on the book. It buys at market the moment price reaches this level."
                          : "A waiting rung — nothing rests on the book. It buys at market the moment price reaches this level. The × calls it off."
                }
              >
                {/* Dollars, not a coin count. "Rung 1 · 2" read as a range,
                  and 2 of a coin says nothing about what is at stake. */}
                {skipped
                  ? `Rung ${index + 1} · skipped`
                  : `Rung ${index + 1} · ${formatUsdRounded(rung.px * rung.sz)}`}
                {skipped || readOnly ? null : (
                  <button
                    type="button"
                    aria-label={`Cancel rung ${index + 1}`}
                    className="rounded p-0.5 hover:bg-current/15 focus-visible:bg-current/15 focus-visible:outline-none"
                    onClick={() =>
                      onCancelRung?.(ladder.walletId, ladder.id, index)
                    }
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </span>
            </div>
          )
        })
      )}

      {!shapeMoves && summary && settledSummaryY !== null ? (
        <div
          data-dca-ladder-summary
          className="absolute inset-x-0"
          style={{ top: settledSummaryY }}
        >
          {summary}
        </div>
      ) : null}

      {plan.rungs.map((rung, index) => {
        if (!rung.sellOrderId) return null
        const exitPx = orderPrices.get(rung.sellOrderId) ?? exits[index]
        const y = yFor(exitPx)
        if (y === null) return null
        return (
          <div
            key={`sell-${index}`}
            className="absolute inset-x-0"
            style={{ top: y }}
          >
            <div
              className="border-t border-dashed"
              style={{ borderColor: colors.up }}
            />
            <span
              className={TAG_CLASS}
              style={{
                borderColor: colors.up,
                color: colors.up,
                pointerEvents: controls,
              }}
              title="Rung sell — managed by the ladder, so it cannot be dragged. Change the exit rules to move it."
            >
              Rung {index + 1} sell · {formatUsdRounded(exitPx * rung.sz)}
            </span>
          </div>
        )
      })}

      <ExitLadderLines
        ladder={ladder}
        levels={mirroredExits}
        colors={colors}
        yFor={yFor}
        controls={controls}
        movable={!readOnly && onReshapeLadder !== undefined && !tool}
        measureTop={measureTop}
        priceFrom={priceFrom}
        onMove={(exitIndex, exitPx) =>
          onReshapeLadder?.(ladder, { exitIndex, exitPx }) ?? false
        }
      />
    </>
  )
}

function ExitLadderLines({
  ladder,
  levels,
  colors,
  yFor,
  controls,
  movable,
  measureTop,
  priceFrom,
  onMove,
}: {
  ladder: SmartLadder
  levels: readonly number[]
  colors: ChartColors
  yFor: (price: number) => number | null
  controls: "none" | "auto"
  movable: boolean
  measureTop: () => number | null
  priceFrom: (clientY: number, top: number) => number | null
  onMove: (exitIndex: number, exitPx: number) => boolean | Promise<boolean>
}) {
  const [movingScale, setMovingScale] = React.useState<number | null>(null)
  const activeDragCleanup = React.useRef<() => void>(() => undefined)
  React.useEffect(() => () => activeDragCleanup.current(), [])

  const shownLevels = React.useMemo(
    () =>
      movingScale === null
        ? levels
        : levels.map((level) => level * movingScale),
    [levels, movingScale]
  )

  const startDrag =
    (exitIndex: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!movable || movingScale !== null || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const top = measureTop()
      const startingPx = levels[exitIndex]
      if (top === null || !(startingPx > 0)) return

      activeDragCleanup.current()
      const fromY = event.clientY
      let frame = 0
      let lastY = event.clientY
      const readValidPx = (clientY: number) => {
        const px = priceFrom(clientY, top)
        return px !== null &&
          exitLadderGapPctForPrice(ladder.plan, exitIndex, px) !== null
          ? px
          : null
      }
      const update = () => {
        frame = 0
        const px = readValidPx(lastY)
        if (px !== null) setMovingScale(px / startingPx)
      }
      const onPointerMove = (move: PointerEvent) => {
        lastY = move.clientY
        if (!frame) frame = requestAnimationFrame(update)
      }
      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("pointerup", onPointerUp)
        window.removeEventListener("pointercancel", onPointerCancel)
        if (frame) cancelAnimationFrame(frame)
        activeDragCleanup.current = () => undefined
      }
      const onPointerCancel = () => {
        cleanup()
        setMovingScale(null)
      }
      const onPointerUp = (up: PointerEvent) => {
        cleanup()
        if (Math.abs(up.clientY - fromY) < DRAG_SLOP) {
          setMovingScale(null)
          return
        }
        const px = readValidPx(up.clientY)
        if (px === null) {
          setMovingScale(null)
          return
        }
        setMovingScale(px / startingPx)
        void Promise.resolve(onMove(exitIndex, px)).finally(() =>
          setMovingScale(null)
        )
      }

      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp)
      window.addEventListener("pointercancel", onPointerCancel)
      activeDragCleanup.current = cleanup
    }

  return shownLevels.map((px, index) => {
    const exit = ladder.plan.exitRungs[index]
    if (exit?.status === "sold") return null
    const y = yFor(px)
    if (y === null) return null
    const armed = Boolean(exit?.orderId && exit.armedSz > 0)
    const sourceRungIndex = ladder.plan.rungs.length - 1 - index
    const sourceRung = ladder.plan.rungs[sourceRungIndex]
    const sourceSz = armed
      ? (exit?.armedSz ?? 0)
      : exitLadderPlannedSz(ladder.plan, index)
    const profit = sourceRung ? (px - sourceRung.px) * sourceSz : 0
    const label = `Exit rung ${sourceRungIndex + 1} for profit at ${formatSignedUsd(profit)}`
    return (
      <div
        key={`exit-${index}`}
        className={cn("absolute inset-x-0", !armed && "opacity-40")}
        style={{ top: y }}
      >
        <div
          className={cn("border-t", !armed && "border-dashed")}
          style={{ borderColor: colors.up }}
        />
        <span
          className={TAG_CLASS}
          style={{
            borderColor: colors.up,
            color: colors.up,
            pointerEvents: controls,
          }}
          title={
            movable
              ? "Drag to move every exit and change the gap above the buys."
              : armed
                ? "A reduce-only sell managed by the ladder."
                : "This exit becomes active once the ladder holds enough coins to cover it."
          }
        >
          {movable ? (
            <button
              type="button"
              className="flex cursor-ns-resize items-center gap-0.5 rounded focus-visible:outline-none"
              aria-label={`Move the whole exit ladder from rung ${sourceRungIndex + 1}'s exit`}
              onPointerDown={startDrag(index)}
            >
              <GripVerticalIcon className="size-3" />
              {label}
            </button>
          ) : (
            label
          )}
        </span>
      </div>
    )
  })
}
