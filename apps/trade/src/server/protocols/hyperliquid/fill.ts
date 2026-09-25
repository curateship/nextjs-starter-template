import { z } from "zod"

import type { WalletOrderFill } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/hyperliquid/translate"

/**
 * A fill as the exchange reports it.
 *
 * `closedPnl`, `fee` and `dir` are the exchange's own accounting and are read
 * rather than worked out: the Journal's money column has to agree with the
 * account, and a subtraction of our own would not. They are optional here
 * because the testnet has been known to leave one out, and a missing figure
 * must not throw away the fill it belongs to — `num` turning it into null is
 * what the zeroes below are for.
 */
export const fillSchema = z.object({
  coin: z.string(),
  px: z.string(),
  sz: z.string(),
  side: z.enum(["B", "A"]),
  time: z.number(),
  oid: z.number(),
  tid: z.union([z.number(), z.string()]),
  closedPnl: z.string().optional(),
  fee: z.string().optional(),
  dir: z.string().optional(),
  liquidation: z.unknown().optional(),
})

/**
 * One fill row as this app keeps it, or null when it cannot be read.
 *
 * **One reader for both ways in.** The same rows arrive two ways — asked for
 * over HTTP, and pushed down the socket by `user-fills-feed.ts` — and the two
 * must never disagree about what a fill is. A second copy of this arithmetic
 * would be a second chance to round a price differently or read a liquidation
 * wrong, on the rows the Journal's money column is built from.
 *
 * Null rather than a throw, because the two callers want different things from
 * an unreadable row: the asked-for path refuses the whole answer, and the feed
 * skips the row rather than letting one bad message kill a live subscription.
 */
export function readHyperliquidFill(row: unknown): WalletOrderFill | null {
  const parsed = fillSchema.safeParse(row)
  if (!parsed.success) return null
  const fill = parsed.data
  const px = num(fill.px)
  const sz = num(fill.sz)
  if (px === null || sz === null) return null
  return {
    fillId: String(fill.tid),
    orderId: String(fill.oid),
    marketId: fill.coin,
    side: fill.side === "B" ? ("buy" as const) : ("sell" as const),
    px,
    sz,
    at: fill.time,
    closedPnl: num(fill.closedPnl ?? "0") ?? 0,
    fee: num(fill.fee ?? "0") ?? 0,
    dir: fill.dir ?? "",
    // The exchange sends an object here when it closed the position itself
    // and nothing at all when it did not, so its presence is the answer.
    liquidation: fill.liquidation !== undefined && fill.liquidation !== null,
  }
}

