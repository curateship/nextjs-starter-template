import { and, eq, inArray } from "drizzle-orm"

import type { LiveFill } from "@/lib/trade/live-trades"
import type { TradeSide } from "@/lib/trade/paper"
import { db, type CustomShellDb } from "@/server/trade/db"
import { recordEngineError } from "@/server/trade/engine-errors"
import { tradeOrderAims } from "@/server/trade/schema"

/**
 * The price each real order was first placed at, for slippage (Tyler, 10 Nov
 * 2026: "aimed vs filled"). See `lib/trade/slippage.ts` for what is worked out
 * from it and `tradeOrderAims` for the table.
 *
 * **Never in the way of an order.** The exchange has already taken the order
 * by the time an aim is written, so a failed write is logged and forgotten:
 * the order is placed, and only its slippage reads as a dash. Nothing here is
 * awaited on the path that answers the person placing it.
 */

export type OrderAim = {
  userId: string
  walletId: string
  /** The exchange's own order id, the one its fills report. */
  orderId: string
  marketKey: string
  side: TradeSide
  /** The price the order was first placed at, before any re-place. */
  aimedPx: number
}

/** A price that can stand as an aim: a real, positive number. */
export function usableAim(px: number | null | undefined): px is number {
  return typeof px === "number" && Number.isFinite(px) && px > 0
}

/**
 * Writes an order's aim, once: a second write for the same order keeps the
 * first, so the aim is always the price it went out at. Resolves either way;
 * a failure is recorded as an engine error and the order stands.
 */
export async function recordOrderAim(aim: OrderAim, database: CustomShellDb = db): Promise<void> {
  if (!aim.orderId || !usableAim(aim.aimedPx)) return
  try {
    await database
      .insert(tradeOrderAims)
      .values({
        userId: aim.userId,
        walletId: aim.walletId,
        orderId: aim.orderId,
        marketKey: aim.marketKey,
        side: aim.side,
        aimedPx: aim.aimedPx,
      })
      .onConflictDoNothing()
  } catch (error) {
    recordEngineError("order-aims", `aim not recorded for order ${aim.orderId}`, error)
  }
}

/**
 * An order moved to a new id (a KuCoin drag cancels and places again) keeps
 * the aim of the order it replaced, as an edited order that keeps its id
 * does. Nothing is written when the old order had no aim.
 */
export async function carryOrderAim(
  from: Pick<OrderAim, "userId" | "walletId" | "orderId">,
  toOrderId: string,
  database: CustomShellDb = db
): Promise<void> {
  if (!toOrderId || toOrderId === from.orderId) return
  try {
    const [old] = await database
      .select()
      .from(tradeOrderAims)
      .where(
        and(
          eq(tradeOrderAims.userId, from.userId),
          eq(tradeOrderAims.walletId, from.walletId),
          eq(tradeOrderAims.orderId, from.orderId)
        )
      )
      .limit(1)
    if (!old) return
    await recordOrderAim({ ...old, orderId: toOrderId }, database)
  } catch (error) {
    recordEngineError("order-aims", `aim not carried to order ${toOrderId}`, error)
  }
}

/**
 * Puts each fill's aim on it, read by its order id. A stop or target that
 * fired has no aim of its own (nothing this app sent it as an order), so its
 * level, from the triggers written down per order and keyed
 * `walletId:orderId`, stands as its aim. Fills with neither keep no aim, and
 * their slippage reads as a dash.
 */
export async function stampFillAims(
  userId: string,
  walletIds: readonly string[],
  fills: LiveFill[],
  triggerLevels: ReadonlyMap<string, number> = new Map(),
  database: CustomShellDb = db
): Promise<LiveFill[]> {
  if (walletIds.length === 0 || fills.length === 0) return fills
  const orderIds = [...new Set(fills.map((fill) => fill.orderId).filter(Boolean))]
  if (orderIds.length === 0) return fills
  const rows = await database
    .select({
      walletId: tradeOrderAims.walletId,
      orderId: tradeOrderAims.orderId,
      aimedPx: tradeOrderAims.aimedPx,
    })
    .from(tradeOrderAims)
    .where(
      and(
        eq(tradeOrderAims.userId, userId),
        inArray(tradeOrderAims.walletId, [...walletIds]),
        inArray(tradeOrderAims.orderId, orderIds)
      )
    )
    .catch((error: unknown) => {
      // A slippage column is not a reason to lose the Journal.
      recordEngineError("order-aims", "aims read failed", error)
      return []
    })
  const aims = new Map(rows.map((row) => [`${row.walletId}:${row.orderId}`, row.aimedPx]))
  for (const fill of fills) {
    const key = `${fill.walletId}:${fill.orderId}`
    const aimed = aims.get(key) ?? triggerLevels.get(key)
    if (usableAim(aimed)) fill.aimedPx = aimed
  }
  return fills
}
