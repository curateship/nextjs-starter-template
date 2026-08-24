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
import { formatPrice, formatSize, formatUsd } from "@/lib/trade/format"
import type { TradePosition } from "@/lib/trade/paper"

/**
 * How much of a position to sell, and what happens to the rest.
 *
 * **Selling some of a winner is the most ordinary thing anybody does with
 * one**, and until this window the only button sold all of it — so the choice
 * was all out or all in. The box starts on all of it, because that is what the
 * button did before and nobody should have to fill anything in to get the old
 * behaviour.
 *
 * **All of it and part of it are sold differently, and the difference is not
 * cosmetic.** All of it is a market order: it pays the spread to be out right
 * now, which is what "close everything" is asking for. A part is a reduce-only
 * post-only limit that follows the price, which is what `trading-rules.md`
 * says a close should be — the trade is going your way, there is no hurry, and
 * the spread is money. The window says which one the press will do.
 */

export type PartCloseAsk = { unit: "coins" | "usd"; amount: number }

export function ClosePositionDialog({
  position,
  /** Today's price, for turning dollars into coins on screen. */
  mark,
  walletName,
  busy,
  onCloseAll,
  onClosePart,
  onDismiss,
}: {
  position: TradePosition | null
  mark: number
  walletName: string
  busy: boolean
  onCloseAll: (position: TradePosition) => void
  onClosePart: (position: TradePosition, ask: PartCloseAsk) => void
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
          <CloseForm
            // Keyed by the position, so opening a different row starts from
            // all of it rather than from the last row's number.
            key={position.id}
            position={position}
            mark={mark}
            walletName={walletName}
            busy={busy}
            onCloseAll={onCloseAll}
            onClosePart={onClosePart}
            onDismiss={onDismiss}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** The shares a press fills the box with. 100 is all of it. */
const QUICK_SHARES = [25, 50, 100] as const

function CloseForm({
  position,
  mark,
  walletName,
  busy,
  onCloseAll,
  onClosePart,
  onDismiss,
}: {
  position: TradePosition
  mark: number
  walletName: string
  busy: boolean
  onCloseAll: (position: TradePosition) => void
  onClosePart: (position: TradePosition, ask: PartCloseAsk) => void
  onDismiss: () => void
}) {
  const symbol = marketSymbol(position.marketKey)
  const heldCoin = Math.abs(position.szi)
  const heldUsd = heldCoin * mark
  const long = position.szi > 0

  const [unit, setUnit] = React.useState<"usd" | "coins">("usd")
  // Starts on all of it: that is what this button did before it could do
  // anything else, and the old behaviour is never something to fill in.
  const [amount, setAmount] = React.useState(() => String(round(heldUsd, 2)))

  const typed = Number(amount.trim())
  const ok = amount.trim() !== "" && Number.isFinite(typed) && typed > 0
  const askedCoin = !ok ? 0 : unit === "usd" ? typed / mark : typed
  /**
   * How close to the whole position still counts as the whole position.
   *
   * **The box's own rounding is bigger than you would think.** All of a $99.29
   * position is 35.699133 coins, and the box shows that as "99.29" because it
   * holds cents. Read back, "99.29" is 35.699 coins — a hair short — so
   * pressing the button offered to sell 99.998% of the position and leave a
   * fraction of a cent behind. Anything within the box's own last digit is
   * therefore all of it.
   */
  const grain = unit === "usd" ? 0.005 / mark : 5e-9
  const slack = Math.max(grain, heldCoin * 1e-6)
  const tooBig = askedCoin > heldCoin + slack
  // Never "all of it" when it is more than all of it: the title and the button
  // would then offer to close the whole position while the line underneath
  // said the amount was refused.
  const all = !tooBig && askedCoin >= heldCoin - slack
  const leftCoin = all ? 0 : heldCoin - askedCoin

  const refusal = !ok
    ? `How much to sell has to be a number above zero. All of it is ${unit === "usd" ? formatUsd(heldUsd) : `${formatSize(heldCoin)} ${symbol}`}.`
    : tooBig
      ? `This position only holds ${formatSize(heldCoin)} ${symbol}, worth ${formatUsd(heldUsd)}. Sell that much or less.`
      : null

  const setShare = (share: number) => {
    const coins = (heldCoin * share) / 100
    setAmount(String(round(unit === "usd" ? coins * mark : coins, unit === "usd" ? 2 : 8)))
  }

  const confirm = () => {
    if (refusal) return
    if (all) onCloseAll(position)
    else onClosePart(position, { unit, amount: typed })
    onDismiss()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Close {all ? "the" : "part of the"} {symbol} position in {walletName}?
        </DialogTitle>
        <DialogDescription>
          {long ? "Long" : "Short"} {formatSize(heldCoin)} {symbol}, worth{" "}
          {formatUsd(heldUsd)} at {formatPrice(mark)}.
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>How much comes off</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="close-amount"
                hint="How much of the position to sell. All of it is sold at whatever the market costs right now; a part is sold with a limit that follows the price."
              >
                Sell
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="close-amount"
                  inputMode="decimal"
                  className="flex-1"
                  value={amount}
                  disabled={busy}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={refusal !== null}
                  aria-describedby={refusal ? "close-refusal" : undefined}
                />
                <Select
                  value={unit}
                  disabled={busy}
                  onValueChange={(next) => {
                    const chosen = next as "usd" | "coins"
                    // The same amount, said in the other unit, so switching
                    // never quietly changes what would be sold.
                    if (ok) {
                      setAmount(
                        String(
                          chosen === "usd"
                            ? round(askedCoin * mark, 2)
                            : round(askedCoin, 8)
                        )
                      )
                    }
                    setUnit(chosen)
                  }}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD</SelectItem>
                    <SelectItem value="coins">{symbol}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Shares rather than a third unit: "half of it" is the thought,
                  and the box then shows what half comes to in the unit already
                  chosen, so there is one number on screen and not two. */}
              <div className="flex gap-2">
                {QUICK_SHARES.map((share) => (
                  <Button
                    key={share}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setShare(share)}
                  >
                    {share === 100 ? "All of it" : `${share}%`}
                  </Button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{outcome()}</p>
          </CardContent>
        </Card>
      </DialogBody>

      <DialogFooter>
        {/* Left of the buttons: the body scrolls, and a refusal that scrolls
            away is one the button can be pressed without ever seeing. */}
        <OrderRefusal id="close-refusal" className="mr-auto min-w-0 flex-1">
          {refusal}
        </OrderRefusal>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={busy}
          onClick={onDismiss}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="shrink-0"
          aria-describedby={refusal ? "close-refusal" : undefined}
          disabled={busy || refusal !== null}
          onClick={confirm}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {/* No figure on the button while the box is refused: "Sell 0" reads
              as an amount somebody chose, and nothing was chosen. */}
          {refusal
            ? "Sell"
            : all
              ? "Close all of it"
              : `Sell ${unit === "usd" ? formatUsd(typed) : `${formatSize(askedCoin)} ${symbol}`}`}
        </Button>
      </DialogFooter>
    </>
  )

  /** What the press does, in dollars, before it is pressed. */
  function outcome(): string {
    if (refusal) return "Fix the amount above and this will say what happens."
    if (all) {
      return `All ${formatSize(heldCoin)} ${symbol} is sold at whatever the market costs right now, and everything it has made or lost is banked. This cannot be undone.`
    }
    const soldUsd = askedCoin * mark
    const leftUsd = leftCoin * mark
    const rest =
      position.slPx !== null
        ? `${formatUsd(leftUsd)} keeps running with its stop at ${formatPrice(position.slPx)}.`
        : `${formatUsd(leftUsd)} keeps running, with no stop under it.`
    return `${formatUsd(soldUsd)} of the ${formatUsd(heldUsd)} position, about ${formatSize(askedCoin)} ${symbol} at ${formatPrice(mark)}. ${rest} It is sold with a limit that follows the price and never pays the spread, so it fills when the market comes to it rather than straight away — and it does not give up, because being half out is worse than any price the rest would have got.`
  }
}

/** Trims the arithmetic residue off a figure before it goes in a box. */
function round(value: number, places: number): number {
  return Number(value.toFixed(places))
}
