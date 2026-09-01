import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { FloatingOrderWindow } from "@/components/trade/floating-order-window"
import {
  ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_WIDTH,
  orderWindowBeside,
} from "@/components/trade/order-window-form"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { marketSymbol } from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  bracketPercent,
  bracketPrice,
  bracketTyped,
} from "@/lib/trade/brackets"
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { projectedProfit, type TradeOrder } from "@/lib/trade/paper"

/**
 * Settings for a waiting order, in the same floating chart window used by
 * placed ladders and grids. The bar's cog is the anchor; this is not a page
 * modal because the order and its price line need to stay visible together.
 */
export function OrderEditWindow({
  order,
  anchor = null,
  wide = true,
  busy,
  onSave,
  onClose,
}: {
  order: TradeOrder | null
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
      wallet=""
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
  const [targetPct, setTargetPct] = React.useState(() =>
    bracketPercent(order.px, order.tpPx)
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
  const tpPx = bracketPrice({
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
  const badTarget = bracketTyped(targetPct, tpPx)
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
        "Take profit is how far the price moves your way, in percent. Leave the box empty for no take profit."
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

      {brackets && maxLeverage > 1 ? (
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="order-leverage">Leverage</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {leverage}×
            </span>
          </div>
          <Slider
            id="order-leverage"
            min={1}
            max={maxLeverage}
            step={1}
            value={[leverage]}
            disabled={busy}
            onValueChange={([next]) => setLeverage(next)}
            aria-label="Leverage"
          />
        </div>
      ) : null}

      {brackets ? (
        <>
          <div className="-mx-3 border-t" />
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="order-target"
                hint="How far price has to move your way after the order fills. Leave it empty for no take profit."
              >
                Take profit %
              </FieldLabel>
              <Input
                id="order-target"
                inputMode="decimal"
                placeholder="None"
                value={targetPct}
                disabled={busy}
                onChange={(event) => setTargetPct(event.target.value)}
                aria-invalid={badTarget}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {tpPx
                  ? `${formatPrice(tpPx)} · ${formatSignedUsd(projectedProfit(wouldHold, tpPx))}`
                  : "No target set."}
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
