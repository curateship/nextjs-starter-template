import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  bracketPercent,
  bracketPrice,
  bracketTyped,
} from "@/lib/trade/brackets"
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { projectedProfit, type PaperPosition } from "@/lib/trade/paper"

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
  startTpPx = null,
  busy,
  onSave,
  onClose,
}: {
  position: PaperPosition | null
  /**
   * A price to start the take-profit box from when the position has no target
   * yet — the level right-clicked on the chart. A target already on the
   * position wins over it.
   */
  startTpPx?: number | null
  busy: boolean
  onSave: (
    walletId: string,
    marketKey: string,
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
            startTpPx={startTpPx}
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
  startTpPx,
  busy,
  onSave,
  onClose,
}: {
  position: PaperPosition
  startTpPx: number | null
  busy: boolean
  onSave: (
    walletId: string,
    marketKey: string,
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
    bracketPercent(position.entryPx, position.slPx)
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
  const symbol = parseMarketKey(position.marketKey)?.marketId ?? position.marketKey

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

  const save = async () => {
    if (badTarget || badStop || badSell) return
    const saved = await onSave(position.walletId, position.marketKey, {
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
                      ? `Sells ${trimSize(tpSz)} of ${trimSize(heldSz)} — ${formatUsd(tpSz * tpPx)} — and the rest keeps running with no target.`
                      : "The whole position closes at the target."}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
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

/** A coin amount with the float noise cut off, for the preview lines. */
function trimSize(sz: number): number {
  return Number(sz.toFixed(6))
}
