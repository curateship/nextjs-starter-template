import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { LeverageSlider } from "@/components/trade/leverage-slider"
import { FloatingOrderWindow } from "@/components/trade/floating-order-window"
import {
  ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_WIDTH,
  orderWindowBeside,
} from "@/components/trade/order-window-form"
import { Button } from "@/components/ui/button"
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
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  absoluteBracketPrice,
  bracketPercent,
  bracketPrice,
  bracketTyped,
} from "@/lib/trade/brackets"
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { LOST_MONEY } from "@/lib/trade/money-tone"
import { projectedProfit, type TradeOrder } from "@/lib/trade/paper"

/**
 * Settings for a waiting order, in the same floating chart window used by
 * placed ladders and grids. The bar's cog is the anchor; this is not a page
 * modal because the order and its price line need to stay visible together.
 */
export function OrderEditWindow({
  order,
  wallet,
  anchor = null,
  wide = true,
  busy,
  onSave,
  onClose,
}: {
  order: TradeOrder | null
  /**
   * The name of the wallet the order sits in, or empty when that wallet is not
   * among the loaded ones. Empty shows no name rather than a wrong one.
   */
  wallet: string
  anchor?: Element | null
  wide?: boolean
  busy: boolean
  onSave: (
    walletId: string,
    orderId: string,
    changes: {
      sz: number
      leverage: number
      tpPx: number | null
      slPx: number | null
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  if (!order) return null

  return (
    <FloatingOrderWindow
      label={`Settings for the ${marketSymbol(order.marketKey)} waiting order`}
      wide={wide}
      openedAt={orderWindowBeside(anchor)}
      width={ORDER_WINDOW_WIDTH}
      height={ORDER_WINDOW_HEIGHT}
      title="Order settings"
      // The same colours as the quick order's title: the default green on a
      // long, red on a short.
      titleClassName={order.side === "buy" ? undefined : LOST_MONEY}
      wallet={wallet}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <OrderEditForm
        key={order.id}
        order={order}
        busy={busy}
        onSave={onSave}
        onClose={onClose}
      />
    </FloatingOrderWindow>
  )
}

function OrderEditForm({
  order,
  busy,
  onSave,
  onClose,
}: {
  order: TradeOrder
  busy: boolean
  onSave: (
    walletId: string,
    orderId: string,
    changes: {
      sz: number
      leverage: number
      tpPx: number | null
      slPx: number | null
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const [size, setSize] = React.useState(() => String(order.sz))
  const maxLeverage = Math.max(1, Math.floor(order.maxLeverage))
  const [leverage, setLeverage] = React.useState(() =>
    Math.min(maxLeverage, Math.max(1, order.leverage))
  )
  // Both boxes start from the exit the order already has, so switching
  // between Percent and Price shows the same exit said the other way.
  const [targetUnit, setTargetUnit] = React.useState<"pct" | "price">("pct")
  const [targetPct, setTargetPct] = React.useState(() =>
    bracketPercent(order.px, order.tpPx)
  )
  // Twelve significant figures drop the float noise a percent leaves behind,
  // so an exit of 10% on $100 reads 110 rather than 110.00000000000001.
  const [targetPrice, setTargetPrice] = React.useState(() =>
    order.tpPx === null ? "" : String(Number(order.tpPx.toPrecision(12)))
  )
  const [stopPct, setStopPct] = React.useState(() =>
    bracketPercent(order.px, order.slPx)
  )

  const long = order.side === "buy"
  const symbol = marketSymbol(order.marketKey)
  const typed = Number(size.trim())
  const sz =
    size.trim() !== "" && Number.isFinite(typed) && typed > 0 ? typed : 0
  const badSize = sz <= 0
  const targetTyped = targetUnit === "price" ? targetPrice : targetPct
  const tpPx =
    targetUnit === "price"
      ? absoluteBracketPrice({
          entryPx: order.px,
          price: targetPrice,
          long,
          winning: true,
        })
      : bracketPrice({
          entryPx: order.px,
          percent: targetPct,
          long,
          winning: true,
        })
  const slPx = bracketPrice({
    entryPx: order.px,
    percent: stopPct,
    long,
    winning: false,
  })
  const badTarget = bracketTyped(targetTyped, tpPx)
  const badStop = bracketTyped(stopPct, slPx)
  const wouldHold = { szi: long ? sz : -sz, entryPx: order.px }
  const brackets = !order.reduceOnly

  const save = async () => {
    if (badSize) {
      showErrorToast("Type how many coins this order is for.")
      return
    }
    if (badTarget) {
      showErrorToast(
        targetUnit === "price"
          ? `Exit price has to be ${long ? "above" : "below"} the order at ${formatPrice(order.px)}. Leave the box empty for no exit.`
          : "Exit is how far the price moves your way, in percent. Leave the box empty for no exit."
      )
      return
    }
    if (badStop) {
      showErrorToast(
        "Stop loss is how far the price moves against you, in percent. Leave the box empty for no stop loss."
      )
      return
    }
    const saved = await onSave(order.walletId, order.id, {
      sz,
      leverage,
      tpPx: brackets ? tpPx : null,
      slPx: brackets ? slPx : null,
    })
    if (saved) onClose()
  }

  return (
    <div className="grid gap-4 p-3">
      <p className="text-xs leading-5 text-muted-foreground">
        {long ? "Long" : "Short"} {symbol} waits at {formatPrice(order.px)} on{" "}
        {leverage}× leverage. Drag the order line to change its price.
      </p>

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
          disabled={busy}
          onChange={(event) => setSize(event.target.value)}
          aria-invalid={badSize}
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          {badSize
            ? "Type how many coins this order is for."
            : order.reduceOnly
              ? `${formatUsd(sz * order.px)} at this price, out of what you hold.`
              : `${formatUsd(sz * order.px)} at this price · ${formatUsd(
                  (sz * order.px) / leverage
                )} of your own cash`}
        </p>
      </div>

      {brackets ? (
        <LeverageSlider
          id="order-leverage"
          value={leverage}
          max={maxLeverage}
          disabled={busy}
          onChange={setLeverage}
        />
      ) : null}

      {brackets ? (
        <>
          <div className="-mx-3 border-t" />
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="order-target"
                hint={
                  targetUnit === "price"
                    ? "The price that closes the trade after the order fills. Leave it empty for no exit."
                    : "How far price has to move your way after the order fills. Leave it empty for no exit."
                }
              >
                {targetUnit === "price" ? "Exit price" : "Exit %"}
              </FieldLabel>
              <div className="flex items-start gap-2">
                <Input
                  id="order-target"
                  inputMode="decimal"
                  placeholder="None"
                  className="min-w-0 flex-1"
                  value={targetTyped}
                  disabled={busy}
                  onChange={(event) =>
                    targetUnit === "price"
                      ? setTargetPrice(event.target.value)
                      : setTargetPct(event.target.value)
                  }
                  aria-invalid={badTarget}
                />
                <Select
                  value={targetUnit}
                  disabled={busy}
                  onValueChange={(next) =>
                    setTargetUnit(next as "pct" | "price")
                  }
                >
                  <SelectTrigger
                    className="w-fit"
                    aria-label="How exit is measured"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pct">Percent</SelectItem>
                    <SelectItem value="price">Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {tpPx
                  ? `${formatPrice(tpPx)} · ${formatSignedUsd(projectedProfit(wouldHold, tpPx))}`
                  : "No exit set."}
              </p>
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="order-stop"
                hint="How far price can move against you after the order fills. Leave it empty for no stop loss."
              >
                Stop loss %
              </FieldLabel>
              <Input
                id="order-stop"
                inputMode="decimal"
                placeholder="None"
                value={stopPct}
                disabled={busy}
                onChange={(event) => setStopPct(event.target.value)}
                aria-invalid={badStop}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {slPx
                  ? `${formatPrice(slPx)} · ${formatSignedUsd(projectedProfit(wouldHold, slPx))}`
                  : "No stop set."}
              </p>
            </div>
          </div>
        </>
      ) : null}

      <div className="-mx-3 border-t" />
      <Button
        type="button"
        className="w-full"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Save changes
      </Button>
    </div>
  )
}
