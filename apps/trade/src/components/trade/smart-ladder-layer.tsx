import * as React from "react"
import {
  ArrowUpDownIcon,
  GripVerticalIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import type { ChartSurface } from "@/components/trade/price-chart"
import type { DcaPreview } from "@/components/trade/smart-order-dialog"
import { ladderExitLevels, ladderShapeMovable } from "@/lib/trade/dca"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import { formatPrice, formatUsdRounded } from "@/lib/trade/format"
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
 * The ladder's control tag exists only before anything buys — a line at the
 * clicked price, which is all the ladder is at that point. The moment the
 * first rung buys, the controls fold into the position's own entry pill
 * ("Entry · DCA ladder: 2 waiting ⚙ ×", built by the trade-lines layer) and
 * the clicked price stops pretending to be anything.
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

export const SmartLadderLayer = React.memo(function SmartLadderLayer({
  surface,
  colors,
  marketKey,
  ladders,
  preview,
  tool,
  readOnly = false,
  walletName,
  onCancelRung,
  onCancelLadder,
  onEditExits,
  onReshapeLadder,
}: {
  surface: ChartSurface
  colors: ChartColors
  marketKey: string | null
  /** Every live ladder, whichever wallet holds it; this market's are drawn. */
  ladders: readonly SmartLadder[]
  /** The placement window's rung prices as edited, or null when it is shut. */
  preview: DcaPreview | null
  /** A paint tool in hand takes the pointer; these controls step aside. */
  tool: string | null
  /** Draw the ladder, offer nothing to press. */
  readOnly?: boolean
  walletName: (walletId: string) => string
  onCancelRung?: (walletId: string, ladderId: string, rungIndex: number) => void
  onCancelLadder?: (ladder: SmartLadder) => void
  onEditExits?: (ladder: SmartLadder) => void
  onReshapeLadder?: (
    ladder: SmartLadder,
    shape: { anchorPx: number } | { deepestPx: number }
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
          colors={colors}
          yFor={yFor}
          tool={tool}
          readOnly={readOnly}
          walletName={walletName}
          onCancelRung={onCancelRung}
          onCancelLadder={onCancelLadder}
          onEditExits={onEditExits}
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
  kind: "move" | "resize"
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
  onAnchorPreview,
}: {
  preview: DcaPreview
  colors: ChartColors
  yFor: (price: number) => number | null
  tool: string | null
  measureTop: () => number | null
  priceFrom: (clientY: number, top: number) => number | null
  placed?: boolean
  onCancelRung?: (rungIndex: number) => void
  /** Paint a placed ladder's anchor bar beside its locally dragged rungs. */
  onAnchorPreview?: (anchorPx: number | null) => void
}) {
  const [dragging, setDragging] = React.useState<PreviewDrag | null>(null)
  const activeDragCleanup = React.useRef<() => void>(() => undefined)

  React.useEffect(() => () => activeDragCleanup.current(), [])

  const shownRungs = React.useMemo(() => {
    if (!dragging) return preview.rungs
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

  const startDrag =
    (kind: PreviewDrag["kind"], rungIndex: number) =>
    (event: React.PointerEvent) => {
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
          if (kind === "move") {
            const grabbed = preview.rungs[rungIndex]
            if (grabbed && grabbed.px > 0) {
              onAnchorPreview?.(preview.anchorPx * (px / grabbed.px))
            }
          }
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
        onAnchorPreview?.(null)
      }
      const onUp = (up: PointerEvent) => {
        cleanup()
        if (Math.abs(up.clientY - fromY) < DRAG_SLOP) {
          setDragging(null)
          onAnchorPreview?.(null)
          return
        }
        const px = priceFrom(up.clientY, top)
        if (px === null || !(px > 0)) {
          setDragging(null)
          onAnchorPreview?.(null)
          return
        }
        setDragging({ kind, rungIndex, pointerPx: px })
        let result: void | Promise<boolean>
        if (kind === "resize") {
          if (!(px < preview.anchorPx)) {
            setDragging(null)
            return
          }
          result = preview.onResize(px)
        } else {
          const grabbed = preview.rungs[rungIndex]
          if (!grabbed || !(grabbed.px > 0)) {
            setDragging(null)
            onAnchorPreview?.(null)
            return
          }
          const anchorPx = preview.anchorPx * (px / grabbed.px)
          onAnchorPreview?.(anchorPx)
          result = preview.onMove(anchorPx)
        }
        void Promise.resolve(result).finally(() => {
          setDragging(null)
          onAnchorPreview?.(null)
        })
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onCancel)
      activeDragCleanup.current = cleanup
    }

  const controls = tool ? "none" : "auto"
  const deepestIndex = shownRungs.length - 1

  return shownRungs.map((rung, index) => {
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
  })
}

function LadderLines({
  ladder,
  colors,
  yFor,
  tool,
  readOnly,
  walletName,
  onCancelRung,
  onCancelLadder,
  onEditExits,
  onReshapeLadder,
  measureTop,
  priceFrom,
}: {
  ladder: SmartLadder
  colors: ChartColors
  yFor: (price: number) => number | null
  tool: string | null
  readOnly: boolean
  walletName: (walletId: string) => string
  onCancelRung?: (walletId: string, ladderId: string, rungIndex: number) => void
  onCancelLadder?: (ladder: SmartLadder) => void
  onEditExits?: (ladder: SmartLadder) => void
  onReshapeLadder?: (
    ladder: SmartLadder,
    shape: { anchorPx: number } | { deepestPx: number }
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
  const [movingAnchorPx, setMovingAnchorPx] = React.useState<number | null>(
    null
  )
  const shapeMoves =
    !readOnly && onReshapeLadder !== undefined && ladderShapeMovable(plan)
  // While a paint tool is held, these controls must not steal its presses.
  const controls = tool || readOnly ? "none" : "auto"

  // Only before anything buys: the clicked price is all the ladder is, so its
  // controls sit on a line there. From the first buy on, the entry pill built
  // by the trade-lines layer carries them instead.
  const tagY = bought ? null : yFor(movingAnchorPx ?? plan.anchorPx)

  return (
    <>
      {tagY !== null ? (
        <div className="absolute inset-x-0" style={{ top: tagY }}>
          <div
            className="border-t opacity-60"
            style={{ borderColor: colors.up }}
          />
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
                aria-label="Change the ladder's exits"
                className="rounded p-0.5 hover:bg-current/15 focus-visible:bg-current/15 focus-visible:outline-none"
                onClick={() => onEditExits?.(ladder)}
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
        </div>
      ) : null}

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
          onAnchorPreview={setMovingAnchorPx}
          onCancelRung={(index) =>
            onCancelRung?.(ladder.walletId, ladder.id, index)
          }
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

      {plan.rungs.map((rung, index) => {
        if (!rung.sellOrderId) return null
        const y = yFor(exits[index])
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
              Rung {index + 1} sell · {formatUsdRounded(exits[index] * rung.sz)}
            </span>
          </div>
        )
      })}
    </>
  )
}
