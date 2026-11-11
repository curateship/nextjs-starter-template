import { and, eq, inArray } from "drizzle-orm"

import type { FillOwner, LiveFill } from "@/lib/trade/live-trades"
import type { SmartOrderKind } from "@/lib/trade/smart-plan"
import { db, type CustomShellDb } from "@/server/trade/db"
import { tradeFlowRunOrders, tradeSmartLadders } from "@/server/trade/schema"

/** One stored smart order, as much of it as the stamp below reads. */
export type OwnerLadder = {
  id: string
  walletId: string
  marketKey: string
  kind: SmartOrderKind
  status: "active" | "done"
  flowRunId: string | null
  createdAt: number
  updatedAt: number
}

/** One order a bot placed, from `trade_flow_run_orders`. */
export type OwnerFlowOrder = {
  walletId: string
  orderId: string
  flowRunId: string
  ladderId: string
}

/**
 * Puts on each fill the smart order, and the bot run, that placed it.
 *
 * **An order a bot placed is matched exactly**, by its order id, from the
 * table bots write every order into. Everything else is matched on when:
 * only one smart order works a coin per wallet (`schema.ts`, the one-per-coin
 * index), so a fill on that coin between when the order was placed and when
 * it finished is that order's. A smart order still working has no end yet.
 * A fill matching nothing was placed by hand and keeps no owner.
 *
 * Pure, so the rules can be tested without a database. `stampFillOwners`
 * below does the reading.
 */
export function fillOwnersFrom(
  fills: readonly LiveFill[],
  ladders: readonly OwnerLadder[],
  flowOrders: readonly OwnerFlowOrder[]
): LiveFill[] {
  if (fills.length === 0) return [...fills]
  const byId = new Map(ladders.map((ladder) => [ladder.id, ladder]))
  const exact = new Map(
    flowOrders.map((order) => [`${order.walletId}:${order.orderId}`, order])
  )
  const byCoin = new Map<string, OwnerLadder[]>()
  for (const ladder of ladders) {
    const key = `${ladder.walletId}:${ladder.marketKey}`
    const list = byCoin.get(key) ?? []
    list.push(ladder)
    byCoin.set(key, list)
  }
  // Newest first, so a coin that carried a ladder one week and a grid the next
  // gives a fill to whichever was working at its moment, the later one first.
  for (const list of byCoin.values()) list.sort((a, b) => b.createdAt - a.createdAt)

  return fills.map((fill) => {
    const flow = exact.get(`${fill.walletId}:${fill.orderId}`)
    if (flow) {
      const ladder = byId.get(flow.ladderId)
      const owner: FillOwner = {
        // A bot's signal trade has a ladder row of its own; one the read did
        // not find is still the bot's, and a signal is what bots place most.
        kind: ladder?.kind ?? "signal",
        ladderId: flow.ladderId,
        flowRunId: flow.flowRunId,
      }
      return { ...fill, owner }
    }
    const working = byCoin
      .get(`${fill.walletId}:${fill.marketKey}`)
      ?.find(
        (ladder) =>
          ladder.createdAt <= fill.at &&
          (ladder.status === "active" || fill.at <= ladder.updatedAt)
      )
    if (!working) return fill
    const owner: FillOwner = {
      kind: working.kind,
      ladderId: working.id,
      flowRunId: working.flowRunId,
    }
    return { ...fill, owner }
  })
}

/** Order ids are asked for in pieces, so one read never carries thousands. */
const ORDER_ID_CHUNK = 1_000

/** Reads what `fillOwnersFrom` needs for these fills, then stamps them. */
export async function stampFillOwners(
  userId: string,
  walletIds: readonly string[],
  fills: LiveFill[],
  database: CustomShellDb = db
): Promise<LiveFill[]> {
  if (walletIds.length === 0 || fills.length === 0) return fills
  const marketKeys = [...new Set(fills.map((fill) => fill.marketKey))]
  const orderIds = [...new Set(fills.map((fill) => fill.orderId))]
  const chunks: string[][] = []
  for (let at = 0; at < orderIds.length; at += ORDER_ID_CHUNK) {
    chunks.push(orderIds.slice(at, at + ORDER_ID_CHUNK))
  }
  const [ladderRows, ...flowChunks] = await Promise.all([
    database
      .select({
        id: tradeSmartLadders.id,
        walletId: tradeSmartLadders.walletId,
        marketKey: tradeSmartLadders.marketKey,
        kind: tradeSmartLadders.kind,
        status: tradeSmartLadders.status,
        flowRunId: tradeSmartLadders.flowRunId,
        createdAt: tradeSmartLadders.createdAt,
        updatedAt: tradeSmartLadders.updatedAt,
      })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.walletId, [...walletIds]),
          inArray(tradeSmartLadders.marketKey, marketKeys)
        )
      ),
    ...chunks.map((ids) =>
      database
        .select({
          walletId: tradeFlowRunOrders.walletId,
          orderId: tradeFlowRunOrders.orderId,
          flowRunId: tradeFlowRunOrders.flowRunId,
          ladderId: tradeFlowRunOrders.ladderId,
        })
        .from(tradeFlowRunOrders)
        .where(
          and(
            eq(tradeFlowRunOrders.userId, userId),
            inArray(tradeFlowRunOrders.walletId, [...walletIds]),
            inArray(tradeFlowRunOrders.orderId, ids)
          )
        )
    ),
  ])
  return fillOwnersFrom(
    fills,
    ladderRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    })),
    flowChunks.flat()
  )
}
