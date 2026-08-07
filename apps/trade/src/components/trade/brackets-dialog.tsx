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
import { parseMarketKey } from "@/lib/protocols/contracts"
import { formatPrice, formatSignedUsd } from "@/lib/trade/format"
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

/** From a price back to the distance it sits at, for filling the boxes in. */
function percentFrom(entryPx: number, px: number | null): string {
  if (px === null || !(entryPx > 0)) return ""
  return String(Number((Math.abs(px - entryPx) / entryPx * 100).toFixed(4)))
}

export function BracketsDialog({
  position,
  busy,
  onSave,
  onClose,
}: {
  position: PaperPosition | null
  busy: boolean
  onSave: (
    walletId: string,
    marketKey: string,
    brackets: { tpPx: number | null; slPx: number | null }
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
  busy,
  onSave,
  onClose,
}: {
  position: PaperPosition
  busy: boolean
  onSave: (
    walletId: string,
    marketKey: string,
    brackets: { tpPx: number | null; slPx: number | null }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const [targetPct, setTargetPct] = React.useState(() =>
    percentFrom(position.entryPx, position.tpPx)
  )
  const [stopPct, setStopPct] = React.useState(() =>
    percentFrom(position.entryPx, position.slPx)
  )

  const long = position.szi > 0
  const symbol = parseMarketKey(position.marketKey)?.marketId ?? position.marketKey

  // A percentage far enough the wrong way takes the price through zero, and
  // which side that happens on depends on the direction of the trade. Testing
  // the price it works out to covers both without a rule per side.
  const priceAt = (input: string, winning: boolean): number | null => {
    const pct = Number(input.trim())
    if (input.trim() === "" || !Number.isFinite(pct) || pct <= 0) return null
    const up = winning === long
    const px = position.entryPx * (up ? 1 + pct / 100 : 1 - pct / 100)
    return px > 0 ? px : null
  }

  const tpPx = priceAt(targetPct, true)
  const slPx = priceAt(stopPct, false)

  const typedButBad = (input: string, px: number | null) =>
    input.trim() !== "" && px === null
  const badTarget = typedButBad(targetPct, tpPx)
  const badStop = typedButBad(stopPct, slPx)

  const save = async () => {
    if (badTarget || badStop) return
    const saved = await onSave(position.walletId, position.marketKey, {
      tpPx,
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
                    ? `${formatPrice(tpPx)} · ${formatSignedUsd(projectedProfit(position, tpPx))}`
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
          disabled={busy || badTarget || badStop}
          onClick={() => void save()}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </>
  )
}
