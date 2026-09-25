import { z } from "zod"

import type { WalletOrderFill } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/phemex/translate"

/** The fill fields shared by Phemex's REST history and private socket. */
export const phemexFillSchema = z.object({
  execID: z.string().optional(),
  execId: z.string().optional(),
  orderID: z.string().optional(),
  orderId: z.string().optional(),
  symbol: z.string(),
  side: z.string(),
  execPriceRp: z.union([z.string(), z.number()]).optional(),
  execQtyRq: z.union([z.string(), z.number()]).optional(),
  execQty: z.union([z.string(), z.number()]).optional(),
  execFeeRv: z.union([z.string(), z.number()]).optional(),
  closedSizeRq: z.union([z.string(), z.number()]).optional(),
  closedSize: z.union([z.string(), z.number()]).optional(),
  closedPnlRv: z.union([z.string(), z.number()]).optional(),
  tradeType: z.string().optional(),
  transactTimeNs: z.union([z.string(), z.number()]).optional(),
  execStatus: z.string().optional(),
})

/** Translate one REST or socket row without giving the two paths separate rules. */
export function readPhemexFill(raw: unknown): WalletOrderFill | null {
  const parsed = phemexFillSchema.safeParse(raw)
  if (!parsed.success) return null
  const row = parsed.data
  if (row.tradeType === "Funding") return null

  const fillId = row.execID ?? row.execId ?? ""
  const px = num(row.execPriceRp)
  const sz = num(row.execQtyRq) ?? num(row.execQty)
  const atNs = num(row.transactTimeNs)
  if (
    fillId === "" ||
    fillId === "00000000-0000-0000-0000-000000000000" ||
    px === null ||
    !(px > 0) ||
    sz === null ||
    !(sz > 0) ||
    atNs === null ||
    !(atNs > 0)
  ) {
    return null
  }

  const liquidation =
    row.tradeType === "LiqTrade" || row.tradeType === "AdlTrade"
  const side = row.side === "Sell" ? ("sell" as const) : ("buy" as const)
  const closed = Math.abs(num(row.closedSizeRq) ?? num(row.closedSize) ?? 0) > 0
  return {
    fillId,
    orderId: row.orderID ?? row.orderId ?? "",
    marketId: row.symbol,
    side,
    px,
    sz,
    at: Math.floor(atNs / 1_000_000),
    closedPnl: num(row.closedPnlRv) ?? 0,
    fee: num(row.execFeeRv) ?? 0,
    dir: liquidation
      ? "Liquidation"
      : closed
        ? side === "buy"
          ? "Close Short"
          : "Close Long"
        : row.side,
    liquidation,
  }
}
