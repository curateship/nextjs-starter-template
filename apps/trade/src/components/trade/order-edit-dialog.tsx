import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { parseMarketKey } from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  bracketPercent,
  bracketPrice,
  bracketTyped,
} from "@/lib/trade/brackets"
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { projectedProfit, type PaperOrder } from "@/lib/trade/paper"

/**
 * A waiting order, opened by pressing its own bar on the chart: how much it is
 * for, and where the trade it opens gets out.
 *
 * Its price is not here. The price is the line itself — you drag it — and a box
 * offering to type the same thing would be a second answer to a question the
 * chart has already answered better.
 *
 * The stop and the target are written as a distance from the price the order is
 * waiting at, the same way the position window writes them, and for the same
 * reason: that is the price this order will fill at, because it is still
 * waiting, so nothing has reached it.
 */
export function OrderEditDialog({
  order,
  busy,
  onSave,
  onClose,
}: {
  /** The waiting order being edited, or null when the window is shut. */
  order: PaperOrder | null
  busy: boolean
  onSave: (
    walletId: string,
    orderId: string,
    changes: { sz: number; tpPx: number | null; slPx: number | null }
  ) => Promise<boolean>
  onClose: () => void
}) {
  // The order last opened, kept after `order` goes null so the window still
  // has something to draw while it animates shut.
  const [shown, setShown] = React.useState<PaperOrder | null>(order)
  const [wasOpen, setWasOpen] = React.useState(order !== null)
  const [size, setSize] = React.useState("")
  const [targetPct, setTargetPct] = React.useState("")
  const [stopPct, setStopPct] = React.useState("")

  // Every window that opens starts from its order's own figures — a window
  // shut on a half-typed size must not offer that size again next time.
  // While it stays open it follows the poll instead, because the order under
  // it can move: its line can be dragged to another price, and everything
  // here is measured from that price. Both are adjusted during the render
  // that brings the change in, so no frame shows the old figures.
  const open = order !== null
  const opening = order !== null && (!wasOpen || order.id !== shown?.id)
  if (open !== wasOpen) setWasOpen(open)
  if (order && order !== shown) setShown(order)
  if (order && opening) {
    setSize(String(order.sz))
    setTargetPct(bracketPercent(order.px, order.tpPx))
    setStopPct(bracketPercent(order.px, order.slPx))
  }

  if (!shown) return null

  const long = shown.side === "buy"
  const symbol = parseMarketKey(shown.marketKey)?.marketId ?? shown.marketKey

  const typed = Number(size.trim())
  const sz = size.trim() !== "" && Number.isFinite(typed) && typed > 0 ? typed : 0
  const badSize = sz <= 0

  const tpPx = bracketPrice({
    entryPx: shown.px,
    percent: targetPct,
    long,
    winning: true,
  })
  const slPx = bracketPrice({
    entryPx: shown.px,
    percent: stopPct,
    long,
    winning: false,
  })
  const badTarget = bracketTyped(targetPct, tpPx)
  const badStop = bracketTyped(stopPct, slPx)

  // What this order would be holding once it fills, for saying what each line
  // would pay. It is not held yet — this is what it would be.
  const wouldHold = { szi: long ? sz : -sz, entryPx: shown.px }

  // A reduce-only order never opens a position, so there is nothing for a stop
  // or a target to ride on. The server drops them; the window does not offer
  // them rather than taking them and quietly throwing them away.
  const brackets = !shown.reduceOnly

  // Edits closing the window would throw away — what decides whether it asks
  // before it closes.
  const dirty =
    size !== String(shown.sz) ||
    targetPct !== bracketPercent(shown.px, shown.tpPx) ||
    stopPct !== bracketPercent(shown.px, shown.slPx)

  const save = async () => {
    // The button stays live and says what is wrong, rather than sitting there
    // greyed out with the reason left for you to work out.
    if (badSize) {
      showErrorToast("Type how many coins this order is for.")
      return
    }
    if (badTarget || badStop) {
      showErrorToast(
        "A stop and a target are written as how far the price moves, in percent. Leave a box empty for no line."
      )
      return
    }
    const saved = await onSave(shown.walletId, shown.id, {
      sz,
      tpPx: brackets ? tpPx : null,
      slPx: brackets ? slPx : null,
    })
    if (saved) onClose()
  }

  return (
    <FormDialog
      open={order !== null}
      dirty={dirty}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {long ? "Buy" : "Sell"} order for {symbol}
            </DialogTitle>
            <DialogDescription>
              Waiting at {formatPrice(shown.px)}, on {shown.leverage}× leverage.
              Drag its line on the chart to change that price.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>How much</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="order-size"
                    hint={`How many ${symbol} this order is for. It is rounded down to the smallest step this market allows.`}
                  >
                    Size in {symbol}
                  </FieldLabel>
                  <Input
                    id="order-size"
                    inputMode="decimal"
                    value={size}
                    onChange={(event) => setSize(event.target.value)}
                    aria-invalid={badSize}
                  />
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {badSize
                      ? "Type how many coins this order is for."
                      : shown.reduceOnly
                        ? `${formatUsd(sz * shown.px)} at this price, out of what you hold.`
                        : `${formatUsd(sz * shown.px)} at this price · ${formatUsd(
                            (sz * shown.px) / Math.max(1, shown.leverage)
                          )} of your own cash`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {brackets ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Where it gets out</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid flex-1 gap-2">
                      <FieldLabel
                        htmlFor="order-target"
                        hint="How far the price has to move your way after this order fills before the position is closed for a profit. Leave it empty for no target."
                      >
                        Take profit %
                      </FieldLabel>
                      <Input
                        id="order-target"
                        inputMode="decimal"
                        placeholder="None"
                        value={targetPct}
                        onChange={(event) => setTargetPct(event.target.value)}
                        aria-invalid={badTarget}
                      />
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {tpPx
                          ? `${formatPrice(tpPx)} · ${formatSignedUsd(projectedProfit(wouldHold, tpPx))}`
                          : "No target set."}
                      </p>
                    </div>
                    <div className="grid flex-1 gap-2">
                      <FieldLabel
                        htmlFor="order-stop"
                        hint="How far the price can move against you after this order fills before the position is closed to stop the loss growing. Leave it empty for no stop."
                      >
                        Stop loss %
                      </FieldLabel>
                      <Input
                        id="order-stop"
                        inputMode="decimal"
                        placeholder="None"
                        value={stopPct}
                        onChange={(event) => setStopPct(event.target.value)}
                        aria-invalid={badStop}
                      />
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {slPx
                          ? `${formatPrice(slPx)} · ${formatSignedUsd(projectedProfit(wouldHold, slPx))}`
                          : "No stop set."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
