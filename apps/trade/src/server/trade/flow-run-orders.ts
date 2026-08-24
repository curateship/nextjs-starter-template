import { and, eq, isNull } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { tradeFlowRunOrders, tradeFlowRuns } from "@/server/trade/schema"

/**
 * Writing down which run sent which order, and reading it back.
 *
 * **This is the whole of how a flow's trades are told from anybody else's.** A
 * fill — practice or real — arrives carrying an order id and nothing more, so
 * without a record kept at the moment the order went out there is no way, ever
 * afterwards, to say whether a trade on a wallet was the flow's or the
 * person's. Working it out from "trades on this wallet while the flow was
 * running" is the version that looks reasonable and quietly counts somebody's
 * own trade as the flow's profit.
 *
 * Nothing here throws on a duplicate: the same order can be offered twice by a
 * pass that repeats, and the second offer must change nothing.
 */

export type FlowRunOrderInput = {
  userId: string
  walletId: string
  /** Null for a hand-placed order, which is most of them. Nothing is written. */
  flowRunId: string | null
  ladderId: string
  marketKey: string
  orderIds: readonly string[]
}

/** Records every order id given, if a flow placed them. */
export async function recordFlowRunOrders(
  database: CustomShellDb,
  input: FlowRunOrderInput
): Promise<void> {
  if (!input.flowRunId) return
  const ids = input.orderIds.filter((id) => id.length > 0)
  if (ids.length === 0) return
  await database
    .insert(tradeFlowRunOrders)
    .values(
      ids.map((orderId) => ({
        userId: input.userId,
        walletId: input.walletId,
        orderId,
        flowRunId: input.flowRunId as string,
        ladderId: input.ladderId,
        marketKey: input.marketKey,
      }))
    )
    .onConflictDoNothing()
}

/**
 * The same, off the trading path, where a failure must not take an order down.
 *
 * A missed row costs one trade its label on a dashboard; a throw here would
 * cost a real order that has already been accepted by the exchange. So this is
 * the version the live engine calls, and it says so loudly rather than
 * swallowing the problem.
 */
export async function rememberFlowRunOrders(
  input: FlowRunOrderInput
): Promise<void> {
  try {
    await recordFlowRunOrders(db, input)
  } catch (error) {
    console.error("trade_flow_run_orders write failed", error)
  }
}

/** Every order id one run has sent. */
export async function flowRunOrderIds(
  userId: string,
  flowRunId: string,
  database: CustomShellDb = db
): Promise<Set<string>> {
  const rows = await database
    .select({ orderId: tradeFlowRunOrders.orderId })
    .from(tradeFlowRunOrders)
    .where(
      and(
        eq(tradeFlowRunOrders.userId, userId),
        eq(tradeFlowRunOrders.flowRunId, flowRunId)
      )
    )
  return new Set(rows.map((row) => row.orderId))
}

/** Every order id recorded for one ladder, including ids its plan has forgotten. */
export async function flowLadderOrderIds(
  userId: string,
  walletId: string,
  ladderId: string,
  database: CustomShellDb = db
): Promise<Set<string>> {
  const rows = await database
    .select({ orderId: tradeFlowRunOrders.orderId })
    .from(tradeFlowRunOrders)
    .where(
      and(
        eq(tradeFlowRunOrders.userId, userId),
        eq(tradeFlowRunOrders.walletId, walletId),
        eq(tradeFlowRunOrders.ladderId, ladderId)
      )
    )
  return new Set(rows.map((row) => row.orderId))
}

/** Refuses a flow placement after Stop has claimed its wallet lock. */
export async function assertFlowRunAcceptingPlacements(
  database: CustomShellDb,
  userId: string,
  flowRunId: string | null | undefined
): Promise<void> {
  if (!flowRunId) return
  const [row] = await database
    .select({ id: tradeFlowRuns.id })
    .from(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        eq(tradeFlowRuns.id, flowRunId),
        eq(tradeFlowRuns.status, "running"),
        isNull(tradeFlowRuns.pausedAt)
      )
    )
    .limit(1)
  if (!row) throw new Error("FLOW_NOT_ACCEPTING_PLACEMENTS")
}
