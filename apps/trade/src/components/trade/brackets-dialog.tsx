import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

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
 * A position can bank profit at three fixed prices and sizes. The stop remains
 * one whole-position price. Leaving the stop empty removes it, while removing
 * every target row clears the targets.
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
      targets: Array<{ px: number; sz: number | null }>
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
      targets: Array<{ px: number; sz: number | null }>
      slPx: number | null
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const [stopPct, setStopPct] = React.useState(() =>
    bracketPercent(position.entryPx, position.slPx ?? startSlPx)
  )
  const heldSz = Math.abs(position.szi)
  const [targets, setTargets] = React.useState(() => {
    const existing =
      position.targets.length > 0
        ? position.targets
        : startTpPx !== null
          ? [{ px: startTpPx, sz: null, orderId: null }]
          : []
    return existing.map((target) => ({
      id: crypto.randomUUID(),
      price: String(target.px),
      dollars: String(Number(((target.sz ?? heldSz) * target.px).toFixed(2))),
    }))
  })
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(new Set())
  const [attempted, setAttempted] = React.useState(false)
  const touch = (key: string) =>
    setTouched((current) => new Set(current).add(key))

  const long = position.szi > 0
  const symbol = marketSymbol(position.marketKey)
  const slPx = bracketPrice({
    entryPx: position.entryPx,
    percent: stopPct,
    long,
    winning: false,
  })
  const badStop = bracketTyped(stopPct, slPx)
  const parsedTargets = targets.map((target) => {
    const px = Number(target.price.trim())
    const dollars = Number(target.dollars.trim())
    const validPx =
      Number.isFinite(px) &&
      px > 0 &&
      (long ? px > position.entryPx : px < position.entryPx)
    const validDollars = Number.isFinite(dollars) && dollars > 0
    return {
      ...target,
      px,
      dollars,
      sz: validPx && validDollars ? dollars / px : 0,
      validPx,
      validDollars,
    }
  })
  const coveredSz = parsedTargets.reduce((sum, target) => sum + target.sz, 0)
  const tooMuch = coveredSz > heldSz * (1 + 1e-6)
  const badTarget = parsedTargets.some(
    (target) => !target.validPx || !target.validDollars
  )

  // Every reason this window would refuse, said above the button so nobody
  // presses Save to find out. Same order as the boxes on screen.
  //
  // Which way a box may not go depends on the trade: a long's target is above
  // the entry and its stop below, and on a short they swap. A percentage that
  // takes the price through zero is the one thing the "down" box has to say
  // extra, because 100% below the entry is a price of nothing.
  const refusal = badTarget
    ? `Each target needs a price ${long ? "above" : "below"} the ${formatPrice(position.entryPx)} entry and a dollar size above zero.`
    : tooMuch
      ? `The targets add up to ${formatUsd(parsedTargets.reduce((sum, target) => sum + target.dollars, 0))} at their prices, but the position holds ${formatUsd(heldSz * position.entryPx)} bought at the entry. Lower one or more target sizes.`
      : badStop
        ? long
          ? "Stop loss % has to be above zero and under 100 — 100% below the entry is a price of nothing. Leave it empty for no stop."
          : "Stop loss % has to be a number above zero. Leave it empty for no stop."
        : null

  const save = async () => {
    setAttempted(true)
    if (badTarget || badStop || tooMuch) return
    const savedTargets = parsedTargets.map((target) => ({
      px: target.px,
      sz:
        parsedTargets.length === 1 && target.sz >= heldSz * (1 - 1e-6)
          ? null
          : target.sz,
    }))
    const saved = await onSave(position, {
      targets: savedTargets,
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
            <div className="grid gap-4">
              {parsedTargets.map((target, index) => (
                <div
                  key={target.id}
                  className="grid gap-2 border-b pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Target {index + 1}</p>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove target ${index + 1}`}
                      disabled={busy}
                      onClick={() =>
                        setTargets((current) =>
                          current.filter((one) => one.id !== target.id)
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor={`brackets-target-price-${target.id}`}
                        hint={`The price where target ${index + 1} sells its slice.`}
                      >
                        Price
                      </FieldLabel>
                      <Input
                        id={`brackets-target-price-${target.id}`}
                        inputMode="decimal"
                        value={target.price}
                        disabled={busy}
                        onBlur={() => touch(`${target.id}:price`)}
                        onChange={(event) =>
                          setTargets((current) =>
                            current.map((one) =>
                              one.id === target.id
                                ? { ...one, price: event.target.value }
                                : one
                            )
                          )
                        }
                        aria-invalid={
                          !target.validPx &&
                          (attempted || touched.has(`${target.id}:price`))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor={`brackets-target-size-${target.id}`}
                        hint={`The dollar value target ${index + 1} sells at its target price.`}
                      >
                        Size at target
                      </FieldLabel>
                      <Input
                        id={`brackets-target-size-${target.id}`}
                        inputMode="decimal"
                        value={target.dollars}
                        disabled={busy}
                        onBlur={() => touch(`${target.id}:dollars`)}
                        onChange={(event) =>
                          setTargets((current) =>
                            current.map((one) =>
                              one.id === target.id
                                ? { ...one, dollars: event.target.value }
                                : one
                            )
                          )
                        }
                        aria-invalid={
                          !target.validDollars &&
                          (attempted || touched.has(`${target.id}:dollars`))
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {target.validPx && target.validDollars
                      ? `${formatSize(target.sz)} sold · ${formatSignedUsd(
                          projectedProfit(
                            {
                              szi: Math.sign(position.szi) * target.sz,
                              entryPx: position.entryPx,
                            },
                            target.px
                          )
                        )} banked`
                      : "Enter a valid price and dollar size."}
                  </p>
                </div>
              ))}
              {targets.length < 3 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  disabled={busy}
                  onClick={() =>
                    setTargets((current) => [
                      ...current,
                      { id: crypto.randomUUID(), price: "", dollars: "" },
                    ])
                  }
                >
                  <PlusIcon />
                  Add target
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Three targets is the maximum.
                </p>
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                {targets.length === 0
                  ? "No targets set."
                  : `${formatUsd(Math.min(coveredSz, heldSz) * position.entryPx)} of ${formatUsd(heldSz * position.entryPx)} covered at the entry price.`}
              </p>
            </div>

            <div className="grid gap-2">
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
                disabled={busy}
                onBlur={() => touch("stop")}
                onChange={(event) => setStopPct(event.target.value)}
                aria-invalid={badStop && (attempted || touched.has("stop"))}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {slPx
                  ? `${formatPrice(slPx)} · ${formatSignedUsd(projectedProfit(position, slPx))}`
                  : "No stop set."}
              </p>
            </div>
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
          disabled={busy}
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
            only answers for a day at a time, and the panel holds the newest few
            thousand fills rather than an account&rsquo;s whole history.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function countedFills(count: number): string {
  return count === 1 ? "1 fill" : `${count} fills`
}
