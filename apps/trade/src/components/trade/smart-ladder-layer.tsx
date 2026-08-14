import { SettingsIcon, XIcon } from "lucide-react"

import type { ChartSurface } from "@/components/trade/price-chart"
import { ladderExitLevels } from "@/lib/trade/dca"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import { formatPrice, formatUsdRounded } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

/**
 * A placed DCA ladder, drawn over the candles — and, while the placement
 * window is open, the faint preview of the one being set up.
 *
 * The rungs are drawn from the ladder's own record rather than from the order
 * rows, because not every rung has an order: a rung under the stop is alive
 * but off the book, and a two-green rung never rests one at all. Each state
 * says what it is — waiting, watching, or faded out under the stop — and a
 * waiting rung's × calls just that rung off. None of these lines drag: the
 * ladder's prices are frozen at placement, and the label says so on hover.
 *
 * The ladder's control tag exists only before anything buys — a line at the
 * clicked price, which is all the ladder is at that point. The moment the
 * first rung buys, the controls fold into the position's own entry pill
 * ("Entry · DCA ladder: 2 waiting ⚙ ×", built by the trade-lines layer) and
 * the clicked price stops pretending to be anything.
 */

/** The ladder's own green, a step apart from the take-profit green beside it. */
const LADDER_COLOR = "#059669"
const SELL_COLOR = "#089981"

export function SmartLadderLayer({
  surface,
  marketKey,
  ladders,
  preview,
  tool,
  walletName,
  onCancelRung,
  onCancelLadder,
  onEditExits,
}: {
  surface: ChartSurface
  marketKey: string | null
  /** Every live ladder, whichever wallet holds it; this market's are drawn. */
  ladders: readonly SmartLadder[]
  /** The placement window's rung prices as edited, or null when it is shut. */
  preview: readonly number[] | null
  /** A paint tool in hand takes the pointer; these controls step aside. */
  tool: string | null
  walletName: (walletId: string) => string
  onCancelRung: (walletId: string, ladderId: string, rungIndex: number) => void
  onCancelLadder: (ladder: SmartLadder) => void
  onEditExits: (ladder: SmartLadder) => void
}) {
  const shown = ladders.filter((ladder) => ladder.marketKey === marketKey)

  const yFor = (price: number): number | null => {
    const y = surface.yOf(price)
    if (y === null || y < 0 || y > surface.height) return null
    return y
  }

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: "none", width: surface.width }}
    >
      {preview?.map((px, index) => {
        const y = yFor(px)
        if (y === null) return null
        return (
          <div key={`preview-${index}`} className="absolute inset-x-0" style={{ top: y }}>
            <div
              className="border-t border-dashed opacity-40"
              style={{ borderColor: LADDER_COLOR }}
            />
            <span
              className="absolute right-1 top-0 -translate-y-1/2 rounded px-1 text-[10px] tabular-nums opacity-70"
              style={{ color: LADDER_COLOR }}
            >
              Rung {index + 1} · {formatPrice(px)}
            </span>
          </div>
        )
      })}

      {shown.map((ladder) => (
        <LadderLines
          key={ladder.id}
          ladder={ladder}
          yFor={yFor}
          tool={tool}
          walletName={walletName}
          onCancelRung={onCancelRung}
          onCancelLadder={onCancelLadder}
          onEditExits={onEditExits}
        />
      ))}
    </div>
  )
}

function LadderLines({
  ladder,
  yFor,
  tool,
  walletName,
  onCancelRung,
  onCancelLadder,
  onEditExits,
}: {
  ladder: SmartLadder
  yFor: (price: number) => number | null
  tool: string | null
  walletName: (walletId: string) => string
  onCancelRung: (walletId: string, ladderId: string, rungIndex: number) => void
  onCancelLadder: (ladder: SmartLadder) => void
  onEditExits: (ladder: SmartLadder) => void
}) {
  const plan = ladder.plan
  const waiting = plan.rungs.filter((rung) => rung.status === "waiting").length
  const bought = plan.rungs.some(
    (rung) => rung.status === "filled" || rung.status === "sold"
  )
  const exits = ladderExitLevels(plan)
  // While a paint tool is held, these controls must not steal its presses.
  const controls = tool ? "none" : "auto"

  // Only before anything buys: the clicked price is all the ladder is, so its
  // controls sit on a line there. From the first buy on, the entry pill built
  // by the trade-lines layer carries them instead.
  const tagY = bought ? null : yFor(plan.anchorPx)

  return (
    <>
      {tagY !== null ? (
        <div className="absolute inset-x-0" style={{ top: tagY }}>
          <div
            className="border-t opacity-60"
            style={{ borderColor: LADDER_COLOR }}
          />
          <span
            className="absolute right-1 top-0 flex -translate-y-1/2 items-center gap-0.5 rounded px-1 text-[11px] font-medium text-white"
            style={{ backgroundColor: LADDER_COLOR, pointerEvents: controls }}
            title={`${walletName(ladder.walletId)} — the ladder hangs from ${formatPrice(plan.anchorPx)}. Rung prices are frozen; cancel and place again for a different ladder.`}
          >
            DCA ladder{waiting > 0 ? ` · ${waiting} waiting` : ""}
            <button
              type="button"
              aria-label="Change the ladder's exits"
              className="rounded p-0.5 hover:bg-white/20 focus-visible:bg-white/20 focus-visible:outline-none"
              onClick={() => onEditExits(ladder)}
            >
              <SettingsIcon className="size-3" />
            </button>
            {waiting > 0 ? (
              <button
                type="button"
                aria-label="Stop buying deeper — cancel every waiting rung"
                className="rounded p-0.5 hover:bg-white/20 focus-visible:bg-white/20 focus-visible:outline-none"
                onClick={() => onCancelLadder(ladder)}
              >
                <XIcon className="size-3" />
              </button>
            ) : null}
          </span>
        </div>
      ) : null}

      {plan.rungs.map((rung, index) => {
        // A rung that missed its moment stays on the chart, faded, rather than
        // disappearing: five buys were asked for, and one quietly going away
        // with nothing said is the one thing this must never do.
        const missed = rung.status === "skipped"
        if (rung.status !== "waiting" && !missed) return null
        const y = yFor(rung.px)
        if (y === null) return null
        return (
          <div
            key={`rung-${index}`}
            className={cn(
              "absolute inset-x-0",
              (rung.dead || missed) && "opacity-40"
            )}
            style={{ top: y }}
          >
            <div
              className="border-t border-dashed"
              style={{ borderColor: LADDER_COLOR }}
            />
            <span
              className="absolute right-1 top-0 flex -translate-y-1/2 items-center gap-0.5 rounded px-1 text-[11px] text-white"
              style={{ backgroundColor: LADDER_COLOR, pointerEvents: controls }}
              title={
                missed
                  ? "This rung never bought — price reached it while the cash was already spent, or passed it while it sat under your stop. It will not buy now."
                  : rung.dead
                    ? "Below your stop — if the stop hits, this rung is cancelled without buying. It wakes up if the stop moves back down."
                    : plan.twoGreen
                      ? rung.touched
                        ? "Price has reached this rung — it buys at market once two green candles in a row confirm."
                        : "Watching — nothing rests on the book until price reaches it and two green candles confirm."
                      : "A waiting rung — nothing rests on the book. It buys at market the moment price reaches this level. The × calls it off."
              }
            >
              {/* Dollars, not a coin count. "Rung 1 · 2" read as a range,
                  and 2 of a coin says nothing about what is at stake. */}
              {missed
                ? `Rung ${index + 1} · missed`
                : `Rung ${index + 1} · ${formatUsdRounded(rung.px * rung.sz)}`}
              {missed ? null : (
                <button
                  type="button"
                  aria-label={`Cancel rung ${index + 1}`}
                  className="rounded p-0.5 hover:bg-white/20 focus-visible:bg-white/20 focus-visible:outline-none"
                  onClick={() => onCancelRung(ladder.walletId, ladder.id, index)}
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </span>
          </div>
        )
      })}

      {plan.rungs.map((rung, index) => {
        if (!rung.sellOrderId) return null
        const y = yFor(exits[index])
        if (y === null) return null
        return (
          <div key={`sell-${index}`} className="absolute inset-x-0" style={{ top: y }}>
            <div
              className="border-t border-dashed"
              style={{ borderColor: SELL_COLOR }}
            />
            <span
              className="absolute right-1 top-0 -translate-y-1/2 rounded px-1 text-[11px] text-white"
              style={{ backgroundColor: SELL_COLOR, pointerEvents: controls }}
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

