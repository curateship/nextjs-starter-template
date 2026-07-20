import * as React from "react"
import { GripVerticalIcon, Loader2Icon } from "lucide-react"

import { formatPriceDisplay } from "@/components/trading/format"
import {
  ConfirmOrderDialog,
  formatUsd,
  resolveSizeCoin,
  type SizeUnit,
  type TicketState,
} from "@/components/trading/order-ticket"
import { isMarketableLimit } from "@/lib/trading/marketable-limit"
import type { OrderDefaults } from "@/lib/trading/order-defaults"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  getOrderErrorMessage,
  placeOrder,
  updateLeverage,
  type PlaceOrderResponse,
} from "@/lib/api/orders"
import { placePaperOrder } from "@/lib/api/paper"
import type { MarketRow } from "@/lib/hl/hooks"
import { previewOrder } from "@/lib/order-preview"
import { cn } from "@/lib/utils"

export type QuickOrderState = {
  side: "buy" | "sell"
  /** Rounded price string, taken from the clicked chart level. */
  px: string
  x: number
  y: number
}

const PANEL_WIDTH = 288
const PANEL_MAX_HEIGHT = 560

/** Trigger price from a percentage distance, as a clean decimal string. */
function priceToString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ""
  return value.toFixed(8).replace(/\.?0+$/, "")
}

function clampLeft(value: number) {
  return Math.max(8, Math.min(value, window.innerWidth - PANEL_WIDTH - 8))
}
function clampTop(value: number) {
  return Math.max(8, Math.min(value, window.innerHeight - PANEL_MAX_HEIGHT))
}

/**
 * Bigger sibling of the chart right-click menu: opens in the same spot after a
 * "Buy limit" / "Sell limit" pick and places a limit order at the clicked price
 * without leaving the chart. Side, type (limit), and price are fixed; the user
 * chooses size, leverage, protective stop-loss / take-profit, and reduce-only.
 * The header is a drag handle so the panel can be moved off the price level.
 */
export function ChartQuickOrder({
  quick,
  market,
  marketRow,
  markPx,
  equity,
  positionSzi,
  walletId,
  paperWalletId,
  disabledReason,
  confirmationEnabled,
  orderDefaults,
  onNotify,
  onOrderPlaced,
  onClose,
}: {
  quick: QuickOrderState
  market: string
  marketRow: MarketRow | null
  markPx: number
  equity: number
  positionSzi: number
  walletId: string | null
  paperWalletId?: string | null
  disabledReason: string | null
  confirmationEnabled: boolean
  /** Starting values from Trading settings. */
  orderDefaults: OrderDefaults
  onNotify: (message: string, tone: "ok" | "error") => void
  /** Fired after an order is accepted so the parent can pull fresh state. */
  onOrderPlaced?: () => void
  onClose: () => void
}) {
  const isPaper = Boolean(paperWalletId)
  const maxLeverage = marketRow?.maxLeverage ?? 1

  const [szInput, setSzInput] = React.useState("")
  const [szUnit, setSzUnit] = React.useState<SizeUnit>(orderDefaults.sizeUnit)
  const [reduceOnly, setReduceOnly] = React.useState(false)
  const [leverage, setLeverage] = React.useState(
    Math.min(orderDefaults.leverage, maxLeverage)
  )
  const [isCross, setIsCross] = React.useState(
    marketRow?.onlyIsolated ? false : orderDefaults.marginMode === "cross"
  )
  const [bracketOn, setBracketOn] = React.useState(false)
  const [slPct, setSlPct] = React.useState("")
  const [tpPct, setTpPct] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [applyingLeverage, setApplyingLeverage] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [status, setStatus] = React.useState<{
    tone: "ok" | "error"
    text: string
  } | null>(null)

  const [pos, setPos] = React.useState(() => ({
    left: clampLeft(quick.x),
    top: clampTop(quick.y),
  }))
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null)

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function startDrag(event: React.PointerEvent) {
    dragRef.current = { dx: event.clientX - pos.left, dy: event.clientY - pos.top }
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setPos({
        left: clampLeft(moveEvent.clientX - drag.dx),
        top: Math.max(
          8,
          Math.min(moveEvent.clientY - drag.dy, window.innerHeight - 44)
        ),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const isBuy = quick.side === "buy"
  const entryPx = Number(quick.px) || markPx
  const effectiveLeverage = isPaper ? 1 : leverage
  const ticketState: TicketState = {
    side: quick.side,
    orderType: "limit",
    px: quick.px,
    szInput,
    szUnit,
    tif: "Gtc",
    reduceOnly,
    leverage: effectiveLeverage,
    isCross,
  }
  const szCoin = resolveSizeCoin(ticketState, entryPx, equity)
  const preview = previewOrder({
    side: quick.side,
    px: entryPx,
    sz: szCoin,
    leverage: effectiveLeverage,
    maxLeverage,
    isTaker: false,
  })

  // Stop-loss / take-profit are entered as a percentage distance from the entry
  // price; convert to the trigger price the exchange expects. Stop sits opposite
  // the profit direction (below entry for longs, above for shorts). A percentage
  // that would drive the price to zero or below is rejected so the order is never
  // placed without the protection the user asked for.
  const bracketActive = bracketOn && !isPaper
  const slNum = Number(slPct)
  const tpNum = Number(tpPct)
  const slRaw =
    entryPx > 0 && slNum > 0
      ? entryPx * (isBuy ? 1 - slNum / 100 : 1 + slNum / 100)
      : 0
  const tpRaw =
    entryPx > 0 && tpNum > 0
      ? entryPx * (isBuy ? 1 + tpNum / 100 : 1 - tpNum / 100)
      : 0
  const slValid = !slPct || slRaw > 0
  const tpValid = !tpPct || tpRaw > 0
  const stopLossPx = bracketActive && slPct && slValid ? priceToString(slRaw) : null
  const takeProfitPx =
    bracketActive && tpPct && tpValid ? priceToString(tpRaw) : null

  const submitDisabled =
    Boolean(disabledReason) ||
    busy ||
    (!walletId && !paperWalletId) ||
    szCoin <= 0 ||
    !(entryPx > 0) ||
    !slValid ||
    !tpValid

  async function applyLeverage() {
    if (!walletId) return
    setApplyingLeverage(true)
    setStatus(null)
    try {
      await updateLeverage({ walletId, market, leverage, isCross })
      setStatus({
        tone: "ok",
        text: `Leverage set to ${leverage}x ${isCross ? "cross" : "isolated"}.`,
      })
    } catch (error) {
      setStatus({ tone: "error", text: getOrderErrorMessage(error) })
    } finally {
      setApplyingLeverage(false)
    }
  }

  async function submit() {
    if (!walletId && !paperWalletId) return
    setBusy(true)
    setStatus(null)
    try {
      if (paperWalletId) {
        await placePaperOrder({
          paperWalletId,
          coin: market,
          side: quick.side,
          orderType: "limit",
          px: quick.px,
          sz: szCoin.toFixed(8),
          tif: "Gtc",
          reduceOnly,
        })
        onNotify(
          "Paper order submitted — fills simulate from live market data.",
          "ok"
        )
      } else {
        const result: PlaceOrderResponse = await placeOrder({
          walletId: walletId as string,
          market,
          side: quick.side,
          orderType: "limit",
          px: quick.px,
          sz: szCoin.toFixed(8),
          reduceOnly,
          tif: "Gtc",
          leverage,
          ...(stopLossPx ? { stopLossPx } : {}),
          ...(takeProfitPx ? { takeProfitPx } : {}),
        })
        onNotify(
          result.kind === "filled"
            ? `Filled ${result.totalSz} ${market} @ ${result.avgPx}`
            : `Resting order #${result.oid} @ ${result.px}`,
          "ok"
        )
      }
      setConfirming(false)
      onOrderPlaced?.()
      onClose()
    } catch (error) {
      setConfirming(false)
      setStatus({ tone: "error", text: getOrderErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-50 grid select-none gap-2 rounded-md border bg-popover p-3 text-xs shadow-md"
        style={{ width: PANEL_WIDTH, left: pos.left, top: pos.top }}
      >
        <div
          onPointerDown={startDrag}
          className="-m-1 flex cursor-grab items-center justify-between rounded p-1 active:cursor-grabbing hover:bg-muted"
        >
          <span className="flex items-center gap-1">
            <GripVerticalIcon className="size-3.5 text-muted-foreground" />
            <span
              className={cn(
                "text-sm font-semibold",
                isBuy ? "text-emerald-600" : "text-red-500"
              )}
            >
              {isBuy ? "Buy limit" : "Sell limit"}
            </span>
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {market} @ {formatPriceDisplay(quick.px)}
          </span>
        </div>

        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="quick-sz" className="text-[11px]">
              Size
            </Label>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              Avail. {formatUsd(equity)}
            </span>
          </div>
          <div className="flex items-center rounded-lg bg-muted pl-3">
            <Input
              id="quick-sz"
              value={szInput}
              placeholder="0"
              inputMode="decimal"
              autoFocus
              className="h-9 flex-1 border-none bg-transparent p-0 font-mono shadow-none focus-visible:ring-0"
              onChange={(event) => setSzInput(event.target.value.trim())}
            />
            <Select
              value={szUnit}
              onValueChange={(value) => setSzUnit(value as SizeUnit)}
            >
              <SelectTrigger className="w-fit border-none bg-transparent text-[11px] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">USD</SelectItem>
                <SelectItem value="coin">{market}</SelectItem>
                <SelectItem value="pct">% equity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-0.5 flex gap-1.5">
            {[10, 25, 50, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                className="flex-1 rounded-md bg-muted py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => {
                  setSzUnit("pct")
                  setSzInput(String(pct))
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
          {szCoin > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              ≈ {szCoin.toFixed(Math.min(6, marketRow?.szDecimals ?? 4))}{" "}
              {market} (${preview.notionalUsd.toFixed(2)})
            </span>
          ) : null}
        </div>

        {isPaper ? null : (
          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Leverage</Label>
              <span className="font-mono">{leverage}x</span>
            </div>
            <Slider
              value={[leverage]}
              min={1}
              max={maxLeverage}
              step={1}
              onValueChange={([value]) => setLeverage(value)}
            />
            <div className="mt-1 flex items-center gap-1">
              <Select
                value={isCross ? "cross" : "isolated"}
                disabled={marketRow?.onlyIsolated}
                onValueChange={(value) => setIsCross(value === "cross")}
              >
                <SelectTrigger className="flex-1 rounded-lg border-none bg-muted shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketRow?.onlyIsolated ? null : (
                    <SelectItem value="cross">Cross</SelectItem>
                  )}
                  <SelectItem value="isolated">Isolated</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!walletId || applyingLeverage}
                onClick={() => void applyLeverage()}
              >
                {applyingLeverage ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : null}
                Apply
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          {isPaper ? null : (
            <div className="flex items-center gap-2">
              <Checkbox
                id="quick-bracket"
                checked={bracketOn}
                onCheckedChange={(checked) => setBracketOn(checked === true)}
              />
              <Label htmlFor="quick-bracket" className="text-[11px]">
                Stop loss / take profit
              </Label>
            </div>
          )}

          {bracketActive ? (
            <div className="grid gap-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Stop loss %
                  </Label>
                  <div className="flex items-center rounded-lg bg-muted px-3">
                    <Input
                      value={slPct}
                      placeholder="0"
                      inputMode="decimal"
                      aria-label="Stop-loss percent"
                      className="h-9 flex-1 border-none bg-transparent p-0 font-mono shadow-none focus-visible:ring-0"
                      onChange={(event) => setSlPct(event.target.value.trim())}
                    />
                    <span className="text-[11px] text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Take profit %
                  </Label>
                  <div className="flex items-center rounded-lg bg-muted px-3">
                    <Input
                      value={tpPct}
                      placeholder="0"
                      inputMode="decimal"
                      aria-label="Take-profit percent"
                      className="h-9 flex-1 border-none bg-transparent p-0 font-mono shadow-none focus-visible:ring-0"
                      onChange={(event) => setTpPct(event.target.value.trim())}
                    />
                    <span className="text-[11px] text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              {!slValid || !tpValid ? (
                <span className="text-[11px] text-red-500">
                  Enter a percentage above zero that keeps the price positive.
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Checkbox
              id="quick-reduce-only"
              checked={reduceOnly}
              onCheckedChange={(checked) => setReduceOnly(checked === true)}
            />
            <Label htmlFor="quick-reduce-only" className="text-[11px]">
              Reduce only
            </Label>
          </div>
        </div>

        <Button
          type="button"
          disabled={submitDisabled}
          className={cn(
            "w-full rounded-lg font-semibold text-white",
            isBuy
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-red-600 hover:bg-red-700"
          )}
          onClick={() => {
            if (confirmationEnabled) setConfirming(true)
            else void submit()
          }}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {disabledReason ?? `${isBuy ? "Buy" : "Sell"} limit ${market}-PERP`}
        </Button>

        {status ? (
          <div
            className={cn(
              "rounded-md border px-2 py-1.5",
              status.tone === "ok"
                ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            {status.text}
          </div>
        ) : null}
      </div>

      <ConfirmOrderDialog
        open={confirming}
        busy={busy}
        market={market}
        state={ticketState}
        szCoin={szCoin}
        executionPx={entryPx}
        notionalUsd={preview.notionalUsd}
        estLiquidationPx={preview.estLiquidationPx}
        positionSzi={positionSzi}
        stopLossPx={stopLossPx}
        takeProfitPx={takeProfitPx}
        marketableLimit={isMarketableLimit(ticketState, markPx)}
        onOpenChange={setConfirming}
        onConfirm={() => void submit()}
      />
    </>
  )
}
