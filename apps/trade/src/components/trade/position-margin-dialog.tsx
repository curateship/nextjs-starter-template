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
import { marketSymbol } from "@/lib/protocols/contracts"
import { formatPrice, formatUsd } from "@/lib/trade/format"
import { marginOf } from "@/lib/trade/margin-health"
import { liquidationPx, type TradePosition } from "@/lib/trade/paper"

/**
 * How much borrowed money a position runs on, and how much of your own cash is
 * behind it, after it is already open.
 *
 * **Both are one figure seen from two sides.** A $1,000 position with $200
 * behind it is running at 5×; putting $200 more behind it makes it 2.5×; asking
 * for 2.5× puts $200 more behind it. So the window shows both and moves both
 * whichever box is typed in, and the sentence underneath says where the
 * liquidation price goes.
 *
 * **The liquidation figure is this app's estimate and says so.** The exchange
 * will not tell anybody where liquidation WOULD move to until the money has
 * actually moved; what the row shows after the press is the exchange's own
 * figure, read back. Saying "about" is not hedging, it is the difference
 * between the two.
 *
 * **Practice wallets are refused rather than faked.** The practice engine has
 * no lending model to change mid-trade: its leverage decides the size at the
 * moment of the order and there is nothing to move afterwards. Offering a
 * window that pretended otherwise would make practice a worse guide than none.
 */

export function PositionMarginDialog({
  position,
  /** The most this market allows, from the catalogue. Null when unstated. */
  maxLeverage,
  walletName,
  /** Whether the exchange allows each change, and its reason when it does not. */
  canChangeLeverage: canLeverage,
  leverageRefusal,
  canAdjustMargin: canMargin,
  marginRefusal,
  busy,
  onSetLeverage,
  onAdjustMargin,
  onDismiss,
}: {
  position: TradePosition | null
  maxLeverage: number | null
  walletName: string
  canChangeLeverage: boolean
  leverageRefusal: string | null
  canAdjustMargin: boolean
  marginRefusal: string | null
  busy: boolean
  onSetLeverage: (position: TradePosition, leverage: number) => void
  onAdjustMargin: (position: TradePosition, dollars: number) => void
  onDismiss: () => void
}) {
  return (
    <Dialog
      open={position !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onDismiss()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        {position ? (
          <MarginForm
            // Keyed by the position, so opening a different row starts from
            // its own figures rather than the last one's.
            key={position.id}
            position={position}
            maxLeverage={maxLeverage}
            walletName={walletName}
            canLeverage={canLeverage}
            leverageRefusal={leverageRefusal}
            canMargin={canMargin}
            marginRefusal={marginRefusal}
            busy={busy}
            onSetLeverage={onSetLeverage}
            onAdjustMargin={onAdjustMargin}
            onDismiss={onDismiss}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MarginForm({
  position,
  maxLeverage,
  walletName,
  canLeverage,
  leverageRefusal,
  canMargin,
  marginRefusal,
  busy,
  onSetLeverage,
  onAdjustMargin,
  onDismiss,
}: {
  position: TradePosition
  maxLeverage: number | null
  walletName: string
  canLeverage: boolean
  leverageRefusal: string | null
  canMargin: boolean
  marginRefusal: string | null
  busy: boolean
  onSetLeverage: (position: TradePosition, leverage: number) => void
  onAdjustMargin: (position: TradePosition, dollars: number) => void
  onDismiss: () => void
}) {
  const symbol = marketSymbol(position.marketKey)
  const practice = position.live === undefined
  const notional = Math.abs(position.szi) * position.entryPx
  const marginNow = marginOf(position)
  const leverageNow = position.leverage
  const liquidationNow = position.live
    ? position.live.liquidationPx
    : liquidationPx(position)

  const [leverage, setLeverage] = React.useState(() => String(leverageNow))
  const [margin, setMargin] = React.useState("")

  const typedLeverage = Number(leverage.trim())
  // An empty box means "leave it as it is", the same way an empty percent box
  // in the stop-and-target window means "no target". It is not a mistake to
  // point at, so it draws no refusal and the button simply has nothing to do.
  const leverageBlank = leverage.trim() === ""
  const leverageOk =
    !leverageBlank &&
    Number.isInteger(typedLeverage) &&
    typedLeverage >= 1 &&
    (maxLeverage === null || typedLeverage <= maxLeverage)
  const leverageChanged = leverageOk && typedLeverage !== leverageNow

  const typedMargin = Number(margin.trim())
  const marginOk =
    margin.trim() !== "" && Number.isFinite(typedMargin) && typedMargin !== 0
  const marginLeft = marginOk ? marginNow + typedMargin : marginNow

  /**
   * Where liquidation would sit, either way — the same formula the whole app
   * uses, handed the leverage each change works out to.
   *
   * A real position's `maxLeverage` is not carried on the row (the exchange's
   * own liquidation price is used instead), so the market's cap comes in as a
   * prop. Without it there is no maintenance buffer and no estimate is made,
   * which the sentence says rather than guessing.
   */
  const estimate = (atLeverage: number) =>
    maxLeverage === null
      ? null
      : liquidationPx({
          szi: position.szi,
          entryPx: position.entryPx,
          leverage: atLeverage,
          maxLeverage,
        })

  const afterLeverage = leverageChanged ? estimate(typedLeverage) : null
  // What the position would be running at with that much behind it. Never
  // under 1x: an isolated position cannot be worth less than the cash behind
  // it, so margin past the whole notional buys no more safety and the venues
  // clamp it. Printing "0.7x" would be a figure nobody can act on.
  const leverageAfterMargin =
    marginOk && marginLeft > 0 ? Math.max(1, notional / marginLeft) : null
  const surplus = marginOk && marginLeft > notional
  const afterMargin =
    leverageAfterMargin !== null ? estimate(leverageAfterMargin) : null

  /**
   * Would taking that out put the liquidation price inside the stop?
   *
   * **"Would bring it inside" and "is already inside" are different, and only
   * the first is refused.** A position whose stop already sits past its
   * liquidation price is in that state whatever anybody does next; blocking a
   * withdrawal there traps the cash and fixes nothing. So the test is whether
   * the change is what crosses the line.
   *
   * Both sides of the comparison are this app's own estimate, deliberately.
   * Measuring "after" with our formula and "now" with the exchange's would
   * compare two different arithmetics, and the difference between them would
   * read as a change the withdrawal had caused.
   */
  const liquidationEstimateNow = marginNow > 0 ? estimate(notional / marginNow) : null
  const insideTheStop = (px: number | null) =>
    px !== null &&
    position.slPx !== null &&
    (position.szi > 0 ? px >= position.slPx : px <= position.slPx)
  const pastStop =
    marginOk &&
    typedMargin < 0 &&
    insideTheStop(afterMargin) &&
    !insideTheStop(liquidationEstimateNow)

  const leverageBad = leverageBlank
    ? null
    : !leverageOk
      ? maxLeverage === null
        ? "Leverage has to be a whole number of at least 1."
        : `Leverage has to be a whole number between 1 and ${maxLeverage}.`
      : null
  const marginBad = !marginOk
    ? margin.trim() === ""
      ? null
      : "How much margin to move has to be a number other than zero. A minus takes margin back out."
    : marginLeft <= 0
      ? `This position is holding ${formatUsd(marginNow)} of margin, and taking ${formatUsd(-typedMargin)} back would leave nothing behind it.`
      : typedMargin > 0 && surplus
        ? `${formatUsd(marginNow)} is already behind a position worth ${formatUsd(notional)}, so more cash buys no more room — leverage cannot go under 1×. Take some back instead.`
        : pastStop
          ? `Taking that out moves the liquidation price to about ${formatPrice(afterMargin ?? 0)}, which the market reaches before the stop at ${formatPrice(position.slPx ?? 0)}. The exchange would take the trade before the stop could. Take out less, or move the stop first.`
          : null

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Leverage and margin on {symbol} in {walletName}
        </DialogTitle>
        <DialogDescription>
          {position.szi > 0 ? "Long" : "Short"} {formatUsd(notional)} at{" "}
          {formatPrice(position.entryPx)}. {formatUsd(marginNow)} of your own
          cash is behind it, at {leverageNow}×
          {liquidationNow !== null
            ? `, and the exchange takes it at ${formatPrice(liquidationNow)}`
            : ""}
          .
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        {practice ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Not on a practice wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                The practice engine has no lender to renegotiate with. A
                practice position&rsquo;s leverage decides how big the order was
                at the moment it was placed, and there is nothing behind it to
                move afterwards. Close it and open again at the leverage you
                want.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Leverage</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {canLeverage ? (
                  <>
                    <FieldLabel
                      htmlFor="margin-leverage"
                      hint="How much of this position is borrowed. Higher leverage means less of your own cash behind it and a liquidation price closer to today's."
                    >
                      Leverage
                    </FieldLabel>
                    <Input
                      id="margin-leverage"
                      inputMode="numeric"
                      value={leverage}
                      onChange={(event) => setLeverage(event.target.value)}
                      aria-invalid={leverageBad !== null}
                      aria-describedby={
                        leverageBad ? "margin-leverage-refusal" : undefined
                      }
                    />
                    <OrderRefusal id="margin-leverage-refusal">
                      {leverageBad}
                    </OrderRefusal>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {!leverageChanged
                        ? `Now ${leverageNow}× on ${formatUsd(marginNow)}.`
                        : `${formatUsd(notional / typedLeverage)} behind it at ${typedLeverage}×${
                            afterLeverage !== null
                              ? `, and the exchange would take it at about ${formatPrice(afterLeverage)}`
                              : ""
                          }. This app's estimate. The row shows the exchange's own figure once it answers.`}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          busy || !leverageChanged || leverageBad !== null
                        }
                        onClick={() => onSetLeverage(position, typedLeverage)}
                      >
                        {busy ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : null}
                        Change to {leverageOk ? typedLeverage : leverageNow}×
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {leverageRefusal ?? "Reading what this exchange allows…"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Cash behind it</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {canMargin ? (
                  <>
                    <FieldLabel
                      htmlFor="margin-dollars"
                      hint="Money moved between this position and the wallet's free cash. A plus puts more behind the trade so it can survive a deeper dip; a minus takes it back out."
                    >
                      Add or take back
                    </FieldLabel>
                    <Input
                      id="margin-dollars"
                      inputMode="decimal"
                      placeholder="200, or -100 to take it back"
                      value={margin}
                      onChange={(event) => setMargin(event.target.value)}
                      aria-invalid={marginBad !== null}
                      aria-describedby={
                        marginBad ? "margin-dollars-refusal" : undefined
                      }
                    />
                    <OrderRefusal id="margin-dollars-refusal">
                      {marginBad}
                    </OrderRefusal>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {!marginOk || marginBad !== null
                        ? `Now ${formatUsd(marginNow)} behind it at ${leverageNow}×.`
                        : surplus
                          ? `${formatUsd(marginLeft)} behind it, which is more than the position is worth. Leverage cannot go under 1×, so the extra buys no more room.`
                          : `${formatUsd(marginLeft)} behind it, at about ${(leverageAfterMargin ?? 1).toFixed(1)}×${
                              afterMargin !== null
                                ? `, and the exchange would take it at about ${formatPrice(afterMargin)}`
                                : ""
                            }. This app's estimate. The row shows the exchange's own figure once it answers.`}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || !marginOk || marginBad !== null}
                        onClick={() => onAdjustMargin(position, typedMargin)}
                      >
                        {busy ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : null}
                        {marginOk && typedMargin < 0
                          ? `Take back ${formatUsd(-typedMargin)}`
                          : marginOk
                            ? `Put ${formatUsd(typedMargin)} behind it`
                            : "Move margin"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {marginRefusal ?? "Reading what this exchange allows…"}
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </DialogBody>

      <DialogFooter>
        {/* One Done, because each change has its own button beside its own box:
            there is nothing here to save all at once, and a Save would suggest
            the two travelled together. */}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onDismiss}
        >
          Done
        </Button>
      </DialogFooter>
    </>
  )
}
