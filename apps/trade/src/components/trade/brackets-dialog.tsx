import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { OrderRefusal } from "@/components/trade/order-refusal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { marketSymbol } from "@/lib/protocols/contracts"
import {
  bracketPercent,
  bracketPrice,
  bracketTyped,
} from "@/lib/trade/brackets"
import {
  formatFeeUsd,
  formatPrice,
  formatSignedUsd,
  formatSize,
  formatUsd,
} from "@/lib/trade/format"
import type { LiveFill } from "@/lib/trade/live-trades"
import { projectedProfit, type TradePosition } from "@/lib/trade/paper"
import { positionFees } from "@/lib/trade/position-fees"
import { formatDateTime } from "@/lib/format/format-time"

/**
 * Where a position gets out, either way.
 *
 * Written as a distance from the entry price rather than as two prices,
 * because that is how the decision is actually made — "I'll risk two percent
 * to make five" — and because a percentage means the same thing on a $118,000
 * coin as on a $0.02 one. The price each percentage works out to is shown
 * underneath, along with what it would pay, so nothing has to be taken on trust.
 *
 * Leaving a box empty removes that side. That is the only way to clear one,
 * and it is why the boxes start empty when nothing is set.
 */

export function BracketsDialog({
  position,
  fills,
  startTpPx = null,
  startSlPx = null,
  busy,
  onSave,
  onClose,
}: {
  position: TradePosition | null
  /** Every execution on hand — what the fee total is added up from. */
  fills: readonly LiveFill[]
  /**
   * A price to start the take-profit box from when the position has no target
   * yet — the level right-clicked on the chart. A target already on the
   * position wins over it.
   */
  startTpPx?: number | null
  /**
   * A price to start the stop-loss box from when the position has no stop yet.
   */
  startSlPx?: number | null
  busy: boolean
  onSave: (
    position: TradePosition,
    brackets: {
      tpPx: number | null
      /** Coins the target sells; leave it out to sell the whole position. */
      tpSz?: number | null
      slPx: number | null
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  return (
    <Dialog
      open={position !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        {position ? (
          <BracketsForm
            // Keyed by the position, so opening a different one starts from
            // its own figures rather than the last one's.
            key={position.id}
            position={position}
            fills={fills}
            startTpPx={startTpPx}
            startSlPx={startSlPx}
            busy={busy}
            onSave={onSave}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BracketsForm({
  position,
  fills,
  startTpPx,
  startSlPx,
  busy,
  onSave,
  onClose,
}: {
  position: TradePosition
  fills: readonly LiveFill[]
  startTpPx: number | null
  startSlPx: number | null
  busy: boolean
  onSave: (
    position: TradePosition,
    brackets: {
      tpPx: number | null
      /** Coins the target sells; leave it out to sell the whole position. */
      tpSz?: number | null
      slPx: number | null
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const [targetPct, setTargetPct] = React.useState(() =>
    bracketPercent(position.entryPx, position.tpPx ?? startTpPx)
  )
  const [stopPct, setStopPct] = React.useState(() =>
    bracketPercent(position.entryPx, position.slPx ?? startSlPx)
  )
  // How much of the position the target sells — as a share of it, or as
  // dollars measured at the target price. Everything is the answer a take
  // profit has always given, so that is what the box starts on.
  const heldSz = Math.abs(position.szi)
  const [sellUnit, setSellUnit] = React.useState<"pct" | "usd">("pct")
  const [sellAmount, setSellAmount] = React.useState(() =>
    position.tpSz != null && heldSz > 0
      ? String(Number(((position.tpSz / heldSz) * 100).toFixed(2)))
      : "100"
  )

  const long = position.szi > 0
  const symbol = marketSymbol(position.marketKey)

  const tpPx = bracketPrice({
    entryPx: position.entryPx,
    percent: targetPct,
    long,
    winning: true,
  })
  const slPx = bracketPrice({
    entryPx: position.entryPx,
    percent: stopPct,
    long,
    winning: false,
  })
  const badTarget = bracketTyped(targetPct, tpPx)
  const badStop = bracketTyped(stopPct, slPx)

  // The coins the typed amount works out to, or null when it is everything.
  // An empty box also sells everything — the box starts on 100 for the same
  // reason the percent boxes start empty: the default is what always happened.
  const typedAmount = Number(sellAmount.trim())
  const sellAll =
    sellAmount.trim() === "" ||
    (sellUnit === "pct" && typedAmount >= 100) ||
    (sellUnit === "usd" && tpPx !== null && typedAmount >= heldSz * tpPx)
  const tpSz = sellAll
    ? null
    : sellUnit === "pct"
      ? heldSz * (typedAmount / 100)
      : tpPx !== null
        ? typedAmount / tpPx
        : null
  const badSell =
    tpPx !== null &&
    !sellAll &&
    (!Number.isFinite(typedAmount) ||
      typedAmount <= 0 ||
      tpSz === null ||
      !(tpSz > 0))

  // Every reason this window would refuse, said above the button so nobody
  // presses Save to find out. Same order as the boxes on screen.
  //
  // Which way a box may not go depends on the trade: a long's target is above
  // the entry and its stop below, and on a short they swap. A percentage that
  // takes the price through zero is the one thing the "down" box has to say
  // extra, because 100% below the entry is a price of nothing.
  const refusal = badTarget
    ? long
      ? "Take profit % has to be a number above zero. Leave it empty for no target."
      : "Take profit % has to be above zero and under 100 — a short's target is below the entry, and 100% below is a price of nothing. Leave it empty for no target."
    : badStop
      ? long
        ? "Stop loss % has to be above zero and under 100 — 100% below the entry is a price of nothing. Leave it empty for no stop."
        : "Stop loss % has to be a number above zero. Leave it empty for no stop."
      : badSell
        ? sellUnit === "pct"
          ? "How much comes off has to be a share of the position above zero. 100 sells all of it."
          : `How much comes off has to be dollars above zero. All of it is worth ${formatUsd(heldSz * (tpPx ?? position.entryPx))} at the target.`
        : null

  const save = async () => {
    if (badTarget || badStop || badSell) return
    const saved = await onSave(position, {
      tpPx,
      tpSz: tpPx !== null ? tpSz : null,
      slPx,
    })
    if (saved) onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Stop and target for {symbol}</DialogTitle>
        <DialogDescription>
          {long ? "Long" : "Short"} {Math.abs(position.szi)} at{" "}
          {formatPrice(position.entryPx)}, on {position.leverage}× leverage.
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Where it gets out</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="grid flex-1 gap-2">
                <FieldLabel
                  htmlFor="brackets-target"
                  hint="How far the price has to move your way before the position is closed for a profit. Leave it empty for no target."
                >
                  Take profit %
                </FieldLabel>
                <Input
                  id="brackets-target"
                  inputMode="decimal"
                  placeholder="None"
                  value={targetPct}
                  onChange={(event) => setTargetPct(event.target.value)}
                  aria-invalid={badTarget}
                />
                <p className="text-xs tabular-nums text-muted-foreground">
                  {tpPx
                    ? `${formatPrice(tpPx)} · ${formatSignedUsd(
                        projectedProfit(
                          tpSz !== null && !badSell
                            ? {
                                szi: Math.sign(position.szi) * tpSz,
                                entryPx: position.entryPx,
                              }
                            : position,
                          tpPx
                        )
                      )}`
                    : "No target set."}
                </p>
              </div>
              <div className="grid flex-1 gap-2">
                <FieldLabel
                  htmlFor="brackets-stop"
                  hint="How far the price can move against you before the position is closed to stop the loss growing. Leave it empty for no stop."
                >
                  Stop loss %
                </FieldLabel>
                <Input
                  id="brackets-stop"
                  inputMode="decimal"
                  placeholder="None"
                  value={stopPct}
                  onChange={(event) => setStopPct(event.target.value)}
                  aria-invalid={badStop}
                />
                <p className="text-xs tabular-nums text-muted-foreground">
                  {slPx
                    ? `${formatPrice(slPx)} · ${formatSignedUsd(projectedProfit(position, slPx))}`
                    : "No stop set."}
                </p>
              </div>
            </div>
            {tpPx !== null ? (
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="brackets-sell"
                  hint="How much of the position is sold when the target is reached. 100% sells all of it; anything less sells that piece and leaves the rest running with no target."
                >
                  How much comes off
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="brackets-sell"
                    inputMode="decimal"
                    className="flex-1"
                    value={sellAmount}
                    onChange={(event) => setSellAmount(event.target.value)}
                    aria-invalid={badSell}
                  />
                  <Select
                    value={sellUnit}
                    onValueChange={(next) => {
                      const unit = next as "pct" | "usd"
                      // The same piece, said in the other unit, so switching
                      // never quietly changes what would be sold.
                      const typed = Number(sellAmount.trim())
                      if (Number.isFinite(typed) && typed > 0 && heldSz > 0) {
                        if (unit === "usd" && sellUnit === "pct") {
                          setSellAmount(
                            String(
                              Number(((heldSz * (typed / 100)) * tpPx).toFixed(2))
                            )
                          )
                        } else if (unit === "pct" && sellUnit === "usd") {
                          setSellAmount(
                            String(
                              Number(((typed / tpPx / heldSz) * 100).toFixed(2))
                            )
                          )
                        }
                      }
                      setSellUnit(unit)
                    }}
                  >
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pct">% of position</SelectItem>
                      <SelectItem value="usd">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {badSell
                    ? "That does not work out to a piece of this position."
                    : tpSz !== null
                      ? `Sells ${formatSize(tpSz)} of ${formatSize(heldSz)} — ${formatUsd(tpSz * tpPx)} — and the rest keeps running with no target.`
                      : "The whole position closes at the target."}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <PositionCost position={position} fills={fills} />
      </DialogBody>

      <DialogFooter>
        {/* Left of the buttons rather than under the fields: the body scrolls,
            and a refusal that scrolls away is one the button can be pressed
            without ever seeing. */}
        <OrderRefusal id="brackets-refusal" className="mr-auto min-w-0 flex-1">
          {refusal}
        </OrderRefusal>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="shrink-0"
          aria-describedby={refusal ? "brackets-refusal" : undefined}
          disabled={busy || badTarget || badStop || badSell}
          onClick={() => void save()}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * What this position has cost so far, in one line the row has no room for.
 *
 * **Whose figure it is has to be on screen, not implied.** No exchange reports
 * "fees so far on this open position", so this is an addition of the fills the
 * app has been given, and the words say that. Where the count starts is part
 * of the answer for the same reason: a total that begins after the position
 * opened is a smaller number than the truth, and printing it plain would be
 * the made-up figure `ui-ux.md` exists to prevent.
 *
 * A practice position is different in one way only: the engine charged the
 * fees itself, so it has the whole figure and nothing to qualify.
 */
function PositionCost({
  position,
  fills,
}: {
  position: TradePosition
  fills: readonly LiveFill[]
}) {
  const fees = React.useMemo(
    () => (position.live ? positionFees(fills, position) : null),
    [fills, position]
  )
  const paid = position.live ? fees?.paid : position.feesPaid

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>What it has cost so far</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        <p className="text-sm tabular-nums">
          {paid === undefined ? "—" : formatFeeUsd(paid)}{" "}
          <span className="text-xs text-muted-foreground">in fees</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {!position.live
            ? "Charged by the practice engine on every fill this position has made."
            : fees === null
              ? "No fill has been reported for this position yet, so there is nothing to add up. That is not the same as no fee having been charged."
              : `Added up by this app from ${countedFills(fees.countedFills)} the exchange reported, starting ${formatDateTime(new Date(fees.countedFrom))}. It is not a total the exchange states itself.`}
        </p>
        {fees !== null && !fees.whole ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            That start is after this position opened, so the real total is
            bigger. The fills on hand do not reach back any further — KuCoin
            only answers for a day at a time, and the panel holds the newest
            few thousand fills rather than an account&rsquo;s whole history.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function countedFills(count: number): string {
  return count === 1 ? "1 fill" : `${count} fills`
}
