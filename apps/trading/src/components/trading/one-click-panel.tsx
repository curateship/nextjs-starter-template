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
import { previewOrder, usdToBaseSize } from "@/lib/order-preview"
import { usePersistedState } from "@/lib/use-persisted-state"

export function OneClickPanel({
  walletId,
  isPaper,
  market,
  marketRow,
  markPx,
  equity,
  disabledReason,
  confirmationEnabled,
  onNotify,
}: {
  walletId: string | null
  isPaper: boolean
  market: string
  marketRow: MarketRow | null
  markPx: number
  equity: number
  disabledReason: string | null
  confirmationEnabled: boolean
  onNotify: (message: string, tone: "ok" | "error") => void
}) {
  const [templates, setTemplates] = React.useState<OrderTemplateItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = usePersistedState<string | null>(
    "trading:one-click-template",
    null
  )
  const [confirmSide, setConfirmSide] = React.useState<"buy" | "sell" | null>(
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
      })
      setConfirmSide(null)
      onNotify(
        result.kind === "filled"
          ? `Filled ${result.totalSz} ${market} @ ${result.avgPx}; stop ${result.stopLossPx}, take-profit ${result.takeProfitPx}.`
          : `One-click order #${result.oid} submitted with stop and take-profit.`,
        "ok"
      )
    } catch (error) {
      setConfirmSide(null)
      onNotify(getOrderErrorMessage(error), "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b p-3 text-xs">
      <Select
        value={selected?.id ?? ""}
        disabled={loading || templates.length === 0 || busy}
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
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={Boolean(reason) || busy}
          onClick={() => {
            if (confirmationEnabled) setConfirmSide("buy")
            else void submit("buy")
          }}
        >
          1-Click Long
        </Button>
        <Button
          type="button"
          size="sm"
          className="bg-red-600 text-white hover:bg-red-700"
          disabled={Boolean(reason) || busy}
          onClick={() => {
            if (confirmationEnabled) setConfirmSide("sell")
            else void submit("sell")
          }}
        >
          1-Click Short
        </Button>
      </div>
      {reason ? (
        <p className="text-[11px] text-muted-foreground">{reason}</p>
      ) : null}

      <OneClickConfirmDialog
        open={Boolean(confirmSide)}
        side={confirmSide ?? "buy"}
        market={market}
        template={selected}
        markPx={markPx}
        equity={equity}
        marketRow={marketRow}
        busy={busy}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmSide(null)
        }}
        onConfirm={() => void submit(confirmSide ?? "buy")}
      />
    </div>
  )
}

function OneClickConfirmDialog({
  open,
  side,
  market,
  template,
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
  markPx: number
  equity: number
  marketRow: MarketRow | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  if (!template) return null

  const margin = equity * (template.orderSizePct / 100)
  const notional = margin * template.leverage
  const sz = usdToBaseSize(notional, markPx)
  const preview = previewOrder({
    side,
    px: markPx,
    sz,
    leverage: template.leverage,
    maxLeverage: marketRow?.maxLeverage ?? template.leverage,
    isTaker: true,
  })
  const stop = formatTrigger(
    markPx *
      (side === "buy"
        ? 1 - template.stopLossPct / 100
        : 1 + template.stopLossPct / 100),
    marketRow?.szDecimals ?? 4
  )
  const takeProfit = formatTrigger(
    markPx *
      (side === "buy"
        ? 1 + template.takeProfitPct / 100
        : 1 - template.takeProfitPct / 100),
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
            label="Wallet cash used"
            value={`${template.orderSizePct}% · $${margin.toFixed(2)}`}
          />
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
