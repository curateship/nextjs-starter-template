import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { formatPrice } from "@nktkas/hyperliquid/utils"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  loadOrderTemplates,
  type OrderTemplateItem,
} from "@/lib/api/order-templates"
import { getOrderErrorMessage, placeOneClickOrder } from "@/lib/api/orders"
import type { MarketRow } from "@/lib/hl/hooks"
import {
  resolveOneClickEntryPrice,
  resolveTakeProfitPrice,
} from "@/lib/one-click-order"
import { previewOrder, usdToBaseSize } from "@/lib/order-preview"
import { usePersistedState } from "@/lib/use-persisted-state"

type OneClickOrderOptions = {
  walletId: string | null
  isPaper: boolean
  market: string
  marketRow: MarketRow | null
  markPx: number
  equity: number
  disabledReason: string | null
  confirmationEnabled: boolean
  limitPx?: string
  onNotify: (message: string, tone: "ok" | "error") => void
}

function useOneClickOrder({
  walletId,
  isPaper,
  market,
  marketRow,
  markPx,
  equity,
  disabledReason,
  limitPx,
  onNotify,
}: OneClickOrderOptions) {
  const [templates, setTemplates] = React.useState<OrderTemplateItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = usePersistedState<string | null>(
    "trading:one-click-template",
    null
  )
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    void loadOrderTemplates()
      .then((items) => {
        setTemplates(items)
        setLoadError(null)
      })
      .catch(() => setLoadError("Order templates could not be loaded."))
      .finally(() => setLoading(false))
  }, [])

  const selected =
    templates.find((template) => template.id === selectedId) ??
    templates.find((template) => template.isDefault) ??
    templates[0] ??
    null

  React.useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId, setSelectedId])

  const reason = isPaper
    ? "One-click protection needs exchange trigger orders, which paper wallets do not support."
    : disabledReason
      ? disabledReason
      : loading
        ? "Loading order templates..."
        : loadError
          ? loadError
          : !selected
            ? "Create a template in Settings to use one-click orders."
            : selected.useLimitOrder && !limitPx
              ? "Right-click the chart to choose a limit price."
              : !(markPx > 0) || !(equity > 0)
                ? "A current price and positive wallet equity are required."
                : selected.leverage > (marketRow?.maxLeverage ?? 0)
                  ? `${market} supports up to ${marketRow?.maxLeverage ?? 0}x leverage.`
                  : null

  async function submit(side: "buy" | "sell") {
    if (!walletId || !selected) return
    setBusy(true)
    try {
      const result = await placeOneClickOrder({
        walletId,
        market,
        side,
        templateId: selected.id,
        ...(selected.useLimitOrder && limitPx ? { px: limitPx } : {}),
      })
      onNotify(
        result.kind === "filled"
          ? `Filled ${result.totalSz} ${market} @ ${result.avgPx}; stop ${result.stopLossPx}, take-profit ${result.takeProfitPx}.`
          : `${result.entryOrderType === "limit" ? "Limit" : "One-click"} order #${result.oid} submitted with stop and take-profit.`,
        "ok"
      )
    } catch (error) {
      onNotify(getOrderErrorMessage(error), "error")
    } finally {
      setBusy(false)
    }
  }

  return { templates, selected, reason, busy, setSelectedId, submit }
}

export function OneClickPanel({
  side,
  ...options
}: OneClickOrderOptions & { side: "buy" | "sell" }) {
  const { templates, selected, reason, busy, setSelectedId, submit } =
    useOneClickOrder(options)
  const [confirmSide, setConfirmSide] = React.useState<"buy" | "sell" | null>(
    null
  )

  return (
    <div className="grid gap-1 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          className={
            side === "buy"
              ? "h-8 bg-emerald-600 text-white hover:bg-emerald-700"
              : "h-8 bg-red-600 text-white hover:bg-red-700"
          }
          disabled={Boolean(reason) || busy}
          onClick={() => {
            if (options.confirmationEnabled) setConfirmSide(side)
            else void submit(side)
          }}
        >
          1-Click {side === "buy" ? "Long" : "Short"}
        </Button>
        <Select
          value={selected?.id ?? ""}
          disabled={templates.length === 0 || busy}
          onValueChange={setSelectedId}
        >
          <SelectTrigger
            className="h-8 w-full"
            aria-label="One-click order template"
          >
            <SelectValue placeholder="Select template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
                {template.isDefault ? " ★" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {reason ? (
        <p className="text-[11px] text-muted-foreground">{reason}</p>
      ) : null}

      <OneClickConfirmDialog
        open={Boolean(confirmSide)}
        side={confirmSide ?? "buy"}
        market={options.market}
        template={selected}
        limitPx={options.limitPx}
        markPx={options.markPx}
        equity={options.equity}
        marketRow={options.marketRow}
        busy={busy}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmSide(null)
        }}
        onConfirm={() =>
          void submit(confirmSide ?? "buy").then(() => setConfirmSide(null))
        }
      />
    </div>
  )
}

export function OneClickMenuActions({
  limitPx,
  onQuickOrder,
  onComplete,
  ...options
}: OneClickOrderOptions & {
  limitPx?: string
  onQuickOrder: (side: "buy" | "sell", px: string) => void
  onComplete: () => void
}) {
  const { selected, reason, busy, submit } = useOneClickOrder({
    ...options,
    limitPx,
  })
  const [confirmSide, setConfirmSide] = React.useState<"buy" | "sell" | null>(
    null
  )

  const request = (side: "buy" | "sell") => {
    if (options.confirmationEnabled) {
      setConfirmSide(side)
      return
    }
    void submit(side).then(onComplete)
  }

  const marginUsd = selected
    ? oneClickSizing(selected, options.equity).margin
    : 0
  const marginLabel = marginUsd > 0 ? ` · ~$${marginUsd.toFixed(2)}` : ""

  return (
    <>
      {selected?.useLimitOrder ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-emerald-600 hover:text-emerald-700"
            disabled={Boolean(reason) || busy}
            title={reason ?? undefined}
            onClick={() => request("buy")}
          >
            Buy limit - {selected.sizingMode === "risk" ? "Risk" : "WS"}:
            {selected.orderSizePct}% SL:{selected.stopLossPct}% TP:
            {selected.takeProfitPct}%{marginLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-red-500 hover:text-red-600"
            disabled={Boolean(reason) || busy}
            title={reason ?? undefined}
            onClick={() => request("sell")}
          >
            Sell limit - {selected.sizingMode === "risk" ? "Risk" : "WS"}:
            {selected.orderSizePct}% SL:{selected.stopLossPct}% TP:
            {selected.takeProfitPct}%{marginLabel}
          </Button>
        </>
      ) : null}

      {!selected?.useLimitOrder && limitPx ? (
        <>
          <div className="my-1 border-t" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-emerald-600 hover:text-emerald-700"
            onClick={() => onQuickOrder("buy", limitPx)}
          >
            Buy limit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-red-500 hover:text-red-600"
            onClick={() => onQuickOrder("sell", limitPx)}
          >
            Sell limit
          </Button>
        </>
      ) : null}

      <OneClickConfirmDialog
        open={Boolean(confirmSide)}
        side={confirmSide ?? "buy"}
        market={options.market}
        template={selected}
        limitPx={limitPx}
        markPx={options.markPx}
        equity={options.equity}
        marketRow={options.marketRow}
        busy={busy}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmSide(null)
        }}
        onConfirm={() =>
          void submit(confirmSide ?? "buy").then(() => {
            setConfirmSide(null)
            onComplete()
          })
        }
      />
    </>
  )
}

/** Order sizing for a one-click template, all in USDC. */
function oneClickSizing(template: OrderTemplateItem, equity: number) {
  const sizingAmount = equity * (template.orderSizePct / 100)
  const notional =
    template.sizingMode === "risk"
      ? sizingAmount / (template.stopLossPct / 100)
      : sizingAmount * template.leverage
  return { sizingAmount, notional, margin: notional / template.leverage }
}

function OneClickConfirmDialog({
  open,
  side,
  market,
  template,
  limitPx,
  markPx,
  equity,
  marketRow,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  side: "buy" | "sell"
  market: string
  template: OrderTemplateItem | null
  limitPx?: string
  markPx: number
  equity: number
  marketRow: MarketRow | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  if (!template || !open) return null

  const { sizingAmount, notional, margin } = oneClickSizing(template, equity)
  const entryPrice = resolveOneClickEntryPrice({
    markPrice: markPx,
    useLimitOrder: template.useLimitOrder,
    limitPrice: limitPx,
  })
  const sz = usdToBaseSize(notional, entryPrice)
  const preview = previewOrder({
    side,
    px: entryPrice,
    sz,
    leverage: template.leverage,
    maxLeverage: marketRow?.maxLeverage ?? template.leverage,
    isTaker: !template.useLimitOrder,
  })
  const stop = formatTrigger(
    entryPrice *
      (side === "buy"
        ? 1 - template.stopLossPct / 100
        : 1 + template.stopLossPct / 100),
    marketRow?.szDecimals ?? 4
  )
  const takeProfit = formatTrigger(
    resolveTakeProfitPrice({
      entryPrice,
      currentPrice: markPx,
      side,
      takeProfitPct: template.takeProfitPct,
    }),
    marketRow?.szDecimals ?? 4
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            Confirm 1-Click {side === "buy" ? "Long" : "Short"} {market}
          </DialogTitle>
          <DialogDescription>
            Review the position and protection before it is sent.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-2 text-sm">
          <SummaryRow label="Template" value={template.name} />
          <SummaryRow
            label="Entry"
            value={
              template.useLimitOrder
                ? `Limit · ${formatTrigger(entryPrice, marketRow?.szDecimals ?? 4)}`
                : `Market · about ${formatTrigger(entryPrice, marketRow?.szDecimals ?? 4)}`
            }
          />
          <SummaryRow
            label={
              template.sizingMode === "risk"
                ? "Risk per wallet"
                : "Wallet cash used"
            }
            value={`${template.orderSizePct}% · $${sizingAmount.toFixed(2)}`}
          />
          {template.sizingMode === "risk" ? (
            <SummaryRow
              label="Wallet cash used"
              value={`About $${margin.toFixed(2)}`}
            />
          ) : null}
          <SummaryRow
            label="Position size"
            value={`${sz.toFixed(6)} ${market} · $${preview.notionalUsd.toFixed(2)}`}
          />
          <SummaryRow label="Leverage" value={`${template.leverage}x cross`} />
          <SummaryRow
            label="Stop loss"
            value={`${template.stopLossPct}% · ${stop}`}
          />
          <SummaryRow
            label="Take profit"
            value={`${template.takeProfitPct}% · ${takeProfit}`}
          />
        </DialogBody>
        <DialogFooter variant="plain">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function formatTrigger(price: number, szDecimals: number) {
  try {
    return formatPrice(price, szDecimals, "perp")
  } catch {
    return price.toPrecision(5)
  }
}
