import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { OneClickPanel } from "@/components/trading/one-click-panel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { previewOrder, usdToBaseSize } from "@/lib/order-preview"
import type { MarketRow } from "@/lib/hl/hooks"
import { isMarketableLimit } from "@/lib/trading/marketable-limit"
import type { OrderDefaults } from "@/lib/trading/order-defaults"
import { cn } from "@/lib/utils"

export type SizeUnit = "usd" | "coin" | "pct"

export type TicketState = {
  side: "buy" | "sell"
  orderType: "market" | "limit"
  px: string
  szInput: string
  szUnit: SizeUnit
  tif: "Gtc" | "Ioc" | "Alo"
  reduceOnly: boolean
  leverage: number
  isCross: boolean
}

export type TicketPrefill = {
  px: string
  side?: "buy" | "sell"
}

export function OrderTicket({
  walletId,
  paperWalletId,
  market,
  marketRow,
  markPx,
  equity,
  positionSzi,
  prefill,
  disabledReason,
  confirmationEnabled,
  orderDefaults,
  onNotify,
  onOrderPlaced,
}: {
  walletId: string | null
  /** When set, orders route to the in-house paper engine instead. */
  paperWalletId?: string | null
  market: string
  marketRow: MarketRow | null
  markPx: number
  equity: number
  positionSzi: number
  prefill: TicketPrefill | null
  disabledReason: string | null
  confirmationEnabled: boolean
  /** Starting values from Trading settings. */
  orderDefaults: OrderDefaults
  onNotify: (message: string, tone: "ok" | "error") => void
  /** Fired after an order is accepted so the parent can pull fresh state. */
  onOrderPlaced?: () => void
}) {
  const isPaper = Boolean(paperWalletId)
  const maxLeverage = marketRow?.maxLeverage ?? 1
  const [state, setState] = React.useState<TicketState>({
    side: "buy",
    orderType: orderDefaults.orderType,
    px: "",
    szInput: "",
    szUnit: orderDefaults.sizeUnit,
    tif: "Gtc",
    reduceOnly: false,
    leverage: Math.min(orderDefaults.leverage, maxLeverage),
    isCross: orderDefaults.marginMode === "cross",
  })
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [applyingLeverage, setApplyingLeverage] = React.useState(false)
  const [status, setStatus] = React.useState<{
    tone: "ok" | "error"
    text: string
  } | null>(null)

  // Render-phase state adjustments (React's sanctioned reset pattern) —
  // clear the ticket when the market changes, apply book-click prefills.
  const [prevMarket, setPrevMarket] = React.useState(market)
  if (prevMarket !== market) {
    setPrevMarket(market)
    setState((current) => ({
      ...current,
      px: "",
      szInput: "",
      leverage: Math.min(current.leverage, maxLeverage),
      isCross: marketRow?.onlyIsolated
        ? false
        : orderDefaults.marginMode === "cross",
    }))
    setStatus(null)
  }
  if (
    state.leverage > maxLeverage ||
    (marketRow?.onlyIsolated && state.isCross)
  ) {
    setState((current) => ({
      ...current,
      leverage: Math.min(current.leverage, maxLeverage),
      isCross: marketRow?.onlyIsolated ? false : current.isCross,
    }))
  }
  const [prevPrefill, setPrevPrefill] = React.useState(prefill)
  if (prevPrefill !== prefill) {
    setPrevPrefill(prefill)
    if (prefill) {
      setState((current) => ({
        ...current,
        orderType: "limit",
        px: prefill.px,
        side: prefill.side ?? current.side,
      }))
    }
  }

  const executionPx =
    state.orderType === "limit" && state.px ? Number(state.px) : markPx
  const marketableLimit = isMarketableLimit(state, markPx)
  const effectiveLeverage = isPaper ? 1 : state.leverage
  const szCoin = resolveSizeCoin(
    { ...state, leverage: effectiveLeverage },
    executionPx,
    equity
  )
  const preview = previewOrder({
    side: state.side,
    px: executionPx,
    sz: szCoin,
    leverage: effectiveLeverage,
    maxLeverage,
    isTaker:
      state.orderType === "market" || state.tif === "Ioc" || marketableLimit,
  })

  const submitDisabled =
    Boolean(disabledReason) ||
    busy ||
    (!walletId && !paperWalletId) ||
    szCoin <= 0 ||
    (state.orderType === "limit" && !(Number(state.px) > 0))

  async function applyLeverage() {
    if (!walletId) return
    setApplyingLeverage(true)
    setStatus(null)
    try {
      await updateLeverage({
        walletId,
        market,
        leverage: state.leverage,
        isCross: state.isCross,
      })
      setStatus({
        tone: "ok",
        text: `Leverage set to ${state.leverage}x ${state.isCross ? "cross" : "isolated"}.`,
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
          side: state.side,
          orderType: state.orderType,
          px: state.orderType === "limit" ? state.px : undefined,
          sz: szCoin.toFixed(8),
          tif: state.tif,
          reduceOnly: state.reduceOnly,
        })
        setConfirming(false)
        setStatus({
          tone: "ok",
          text: "Paper order submitted — fills simulate from live market data.",
        })
        setState((current) => ({ ...current, szInput: "" }))
        onOrderPlaced?.()
        return
      }

      const result: PlaceOrderResponse = await placeOrder({
        walletId: walletId as string,
        market,
        side: state.side,
        orderType: state.orderType,
        px: state.orderType === "limit" ? state.px : undefined,
        sz: szCoin.toFixed(8),
        reduceOnly: state.reduceOnly,
        tif: state.tif,
        leverage: state.leverage,
      })
      setConfirming(false)
      setStatus({
        tone: "ok",
        text:
          result.kind === "filled"
            ? `Filled ${result.totalSz} ${market} @ ${result.avgPx}`
            : `Resting order #${result.oid} @ ${result.px}`,
      })
      setState((current) => ({ ...current, szInput: "" }))
      onOrderPlaced?.()
    } catch (error) {
      setConfirming(false)
      setStatus({ tone: "error", text: getOrderErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 p-3 text-xs">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <SegmentButton
            active={state.side === "buy"}
            activeClass="bg-emerald-600 text-white shadow-sm"
            onClick={() => setState({ ...state, side: "buy" })}
          >
            Long
          </SegmentButton>
          <SegmentButton
            active={state.side === "sell"}
            activeClass="bg-red-600 text-white shadow-sm"
            onClick={() => setState({ ...state, side: "sell" })}
          >
            Short
          </SegmentButton>
        </div>

        <div className="flex gap-2">
          <div className="grid flex-1 gap-1">
            <Label className="text-[11px]">Type</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <SegmentButton
                active={state.orderType === "limit"}
                onClick={() => setState({ ...state, orderType: "limit" })}
              >
                Limit
              </SegmentButton>
              <SegmentButton
                active={state.orderType === "market"}
                onClick={() => setState({ ...state, orderType: "market" })}
              >
                Market
              </SegmentButton>
            </div>
          </div>
          <div className="grid w-24 gap-1">
            <Label className="text-[11px]">TIF</Label>
            <Select
              value={state.tif}
              disabled={state.orderType === "market"}
              onValueChange={(value) =>
                setState({ ...state, tif: value as TicketState["tif"] })
              }
            >
              <SelectTrigger className="w-full rounded-lg border-none bg-muted shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Gtc">GTC</SelectItem>
                <SelectItem value="Ioc">IOC</SelectItem>
                <SelectItem value="Alo">Post only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {state.orderType === "limit" ? (
          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="ticket-px" className="text-[11px]">
                Limit price
              </Label>
              <button
                type="button"
                className="text-[11px] font-semibold hover:underline"
                disabled={!markPx}
                onClick={() =>
                  setState({ ...state, px: markPx ? String(markPx) : "" })
                }
              >
                Mid
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3">
              <Input
                id="ticket-px"
                value={state.px}
                placeholder={markPx ? String(markPx) : "0.0"}
                inputMode="decimal"
                className="h-9 flex-1 border-none bg-transparent p-0 font-mono shadow-none focus-visible:ring-0"
                onChange={(event) =>
                  setState({ ...state, px: event.target.value.trim() })
                }
              />
              <span className="text-[11px] text-muted-foreground">USD</span>
            </div>
            {marketableLimit ? (
              <p className="text-[11px] text-muted-foreground">
                {state.side === "buy" ? "Above" : "Below"} the current price —
                this fills straight away as a market{" "}
                {state.side === "buy" ? "long" : "short"}.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="ticket-sz" className="text-[11px]">
              Size
            </Label>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              Avail. {formatUsd(equity)}
            </span>
          </div>
          <div className="flex items-center rounded-lg bg-muted pl-3">
            <Input
              id="ticket-sz"
              value={state.szInput}
              placeholder="0"
              inputMode="decimal"
              className="h-9 flex-1 border-none bg-transparent p-0 font-mono shadow-none focus-visible:ring-0"
              onChange={(event) =>
                setState({ ...state, szInput: event.target.value.trim() })
              }
            />
            <Select
              value={state.szUnit}
              onValueChange={(value) =>
                setState({ ...state, szUnit: value as SizeUnit })
              }
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
                onClick={() =>
                  setState({ ...state, szUnit: "pct", szInput: String(pct) })
                }
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
            <span className="font-mono">{state.leverage}x</span>
          </div>
          <Slider
            value={[state.leverage]}
            min={1}
            max={maxLeverage}
            step={1}
            onValueChange={([value]) =>
              setState({ ...state, leverage: value })
            }
          />
          <div className="mt-1 flex items-center gap-1">
            <Select
              value={state.isCross ? "cross" : "isolated"}
              disabled={marketRow?.onlyIsolated}
              onValueChange={(value) =>
                setState({ ...state, isCross: value === "cross" })
              }
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

        <div className="flex items-center gap-2">
          <Checkbox
            id="ticket-reduce-only"
            checked={state.reduceOnly}
            onCheckedChange={(checked) =>
              setState({ ...state, reduceOnly: checked === true })
            }
          />
          <Label htmlFor="ticket-reduce-only" className="text-[11px]">
            Reduce only
          </Label>
        </div>

        <div className="grid gap-1.5 rounded-lg bg-muted p-3 font-mono text-[11px] tabular-nums">
          <PreviewRow label="Order value" value={`$${preview.notionalUsd.toFixed(2)}`} />
          <PreviewRow
            label="Margin required"
            value={`$${preview.marginRequiredUsd.toFixed(2)}`}
          />
          <PreviewRow label="Est. fee" value={`$${preview.estFeeUsd.toFixed(3)}`} />
          <PreviewRow
            label="Est. liq. price"
            tone="danger"
            value={
              preview.estLiquidationPx
                ? preview.estLiquidationPx.toFixed(2)
                : "—"
            }
          />
        </div>

        <OneClickPanel
          side={state.side}
          walletId={walletId}
          isPaper={isPaper}
          market={market}
          marketRow={marketRow}
          markPx={markPx}
          equity={equity}
          disabledReason={disabledReason}
          confirmationEnabled={confirmationEnabled}
          onNotify={onNotify}
          onOrderPlaced={onOrderPlaced}
        />

        <Button
          type="button"
          disabled={submitDisabled}
          className={cn(
            "w-full rounded-lg font-semibold text-white",
            state.side === "buy"
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-red-600 hover:bg-red-700"
          )}
          onClick={() => {
            if (confirmationEnabled) setConfirming(true)
            else void submit()
          }}
        >
          {disabledReason ??
            `${state.side === "buy" ? "Long" : "Short"} ${market}-PERP`}
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
        state={state}
        szCoin={szCoin}
        executionPx={executionPx}
        notionalUsd={preview.notionalUsd}
        estLiquidationPx={preview.estLiquidationPx}
        positionSzi={positionSzi}
        marketableLimit={marketableLimit}
        onOpenChange={setConfirming}
        onConfirm={() => void submit()}
      />
    </div>
  )
}

/**
 * Segmented-control button (Long/Short, Limit/Market). Defaults to the
 * monochrome black fill; Long/Short pass green/red via activeClass.
 */
function SegmentButton({
  active,
  activeClass = "bg-primary text-primary-foreground shadow-sm",
  onClick,
  children,
}: {
  active: boolean
  activeClass?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
        active ? activeClass : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  })
}

export function ConfirmOrderDialog({
  open,
  busy,
  market,
  state,
  szCoin,
  executionPx,
  notionalUsd,
  estLiquidationPx,
  positionSzi,
  stopLossPx,
  takeProfitPx,
  marketableLimit = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  busy: boolean
  market: string
  state: TicketState
  szCoin: number
  executionPx: number
  notionalUsd: number
  estLiquidationPx: number | null
  positionSzi: number
  marketableLimit?: boolean
  stopLossPx?: string | null
  takeProfitPx?: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            Confirm {state.side === "buy" ? "Long" : "Short"} {market}
          </DialogTitle>
          <DialogDescription>
            Review the order before it is signed and sent to Hyperliquid.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-2 text-sm">
          <SummaryRow label="Market" value={`${market}-PERP`} />
          <SummaryRow
            label="Side"
            value={<Badge>{state.side === "buy" ? "Long" : "Short"}</Badge>}
          />
          <SummaryRow
            label="Type"
            value={
              state.orderType === "market"
                ? "Market"
                : marketableLimit
                  ? `Market (limit ${state.px} is through the price)`
                  : `Limit @ ${state.px} (${state.tif})`
            }
          />
          <SummaryRow
            label="Size"
            value={`${szCoin.toFixed(6)} ${market} ≈ $${notionalUsd.toFixed(2)}`}
          />
          <SummaryRow
            label="Est. price"
            value={executionPx ? executionPx.toString() : "—"}
          />
          <SummaryRow
            label="Reduce only"
            value={state.reduceOnly ? "Yes" : "No"}
          />
          <SummaryRow
            label="Leverage"
            value={`${state.leverage}x ${state.isCross ? "cross" : "isolated"}`}
          />
          {stopLossPx ? (
            <SummaryRow label="Stop loss" value={stopLossPx} />
          ) : null}
          {takeProfitPx ? (
            <SummaryRow label="Take profit" value={takeProfitPx} />
          ) : null}
          <SummaryRow
            label="Est. liq. price"
            value={estLiquidationPx ? estLiquidationPx.toFixed(2) : "—"}
          />
          {positionSzi !== 0 ? (
            <SummaryRow
              label="Current position"
              value={`${positionSzi} ${market}`}
            />
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={onConfirm}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Submitting..." : "Confirm order"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "danger"
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(tone === "danger" && value !== "—" && "text-red-500")}>
        {value}
      </span>
    </div>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

export function resolveSizeCoin(
  state: TicketState,
  executionPx: number,
  equity: number
): number {
  const input = Number(state.szInput)
  if (!Number.isFinite(input) || input <= 0) return 0
  if (state.szUnit === "coin") return input
  if (state.szUnit === "usd") return usdToBaseSize(input, executionPx)
  const usd = (equity * Math.min(input, 100)) / 100
  return usdToBaseSize(usd * state.leverage, executionPx)
}
