import { randomUUID } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { WalletOrderFill } from "@/lib/protocols/contracts"
import { robinhoodRefusals } from "@/server/protocols/robinhood/refusals"
import { db } from "@/server/db"
import { db as tradeDb } from "@/server/trade/db"
import { bumpTradeHistory } from "@/server/trade/history-version"
import {
  tradeLiveFills,
  tradeLiveJournal,
  tradeRobinhoodTransactions as sends,
} from "@/server/trade/schema"

/**
 * Robinhood Chain's record of what it signed, kept before anything is sent.
 *
 * It lives here, one level above the chain's folder, because it writes the
 * app's own tables and `fence.test.ts` keeps exchange folders off them. The
 * shape is BNB Chain's ledger, on Robinhood Chain's own table.
 */
export type RobinhoodOwner = { userId: string; walletId: string }
type RobinhoodApproval = { hash: string; feeEth: number }

function key(marketId: string): string {
  return `robinhood:mainnet:${marketId}`
}

/** A second worker cannot allocate the same chain nonce for this address. */
export async function withRobinhoodSendLock<T>(
  address: string,
  work: () => Promise<T>
): Promise<T> {
  let completed: { value: T } | undefined
  try {
    return await tradeDb.transaction(async (tx) => {
      const result = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${`robinhood:${address.toLowerCase()}`}, 0)) as locked`
      )
      if (!result.rows[0]?.locked) throw robinhoodRefusals.error("pending")
      const pending = await tx
        .select({ hash: sends.hash })
        .from(sends)
        .where(
          and(
            eq(sends.address, address.toLowerCase()),
            eq(sends.state, "pending")
          )
        )
        .limit(1)
      if (pending.length)
        throw robinhoodRefusals.error("pending", { hash: pending[0].hash })
      const value = await work()
      completed = { value }
      return value
    })
  } catch (error) {
    // A commit acknowledgement lost after broadcast must not request another swap.
    if (completed) return completed.value
    throw error
  }
}

export async function rememberRobinhoodSend(
  owner: RobinhoodOwner,
  input: {
    hash: string
    address: string
    marketId: string
    kind: "approval" | "swap"
    approvals?: RobinhoodApproval[]
  }
): Promise<void> {
  await db
    .insert(sends)
    .values({
      ...owner,
      ...input,
      address: input.address.toLowerCase(),
      state: "pending",
    })
    .onConflictDoNothing()
}

export async function pendingRobinhoodSends(owner: RobinhoodOwner) {
  return db
    .select()
    .from(sends)
    .where(
      and(
        eq(sends.userId, owner.userId),
        eq(sends.walletId, owner.walletId),
        eq(sends.state, "pending")
      )
    )
}

export async function finishRobinhoodSend(
  owner: RobinhoodOwner,
  hash: string,
  state: "confirmed" | "failed",
  note: string
): Promise<void> {
  await db
    .update(sends)
    .set({ state, note })
    .where(
      and(
        eq(sends.hash, hash),
        eq(sends.userId, owner.userId),
        eq(sends.walletId, owner.walletId),
        eq(sends.state, "pending")
      )
    )
}

export async function recordRobinhoodFill(
  owner: RobinhoodOwner,
  fill: WalletOrderFill
): Promise<void> {
  await tradeDb.transaction(async (tx) => {
    const rows = await tx
      .insert(tradeLiveFills)
      .values({ ...owner, ...fill, marketKey: key(fill.marketId) })
      .onConflictDoNothing()
      .returning({ id: tradeLiveFills.fillId })
    await tx
      .update(sends)
      .set({ state: "confirmed", note: fill.executionNote ?? "Swap confirmed." })
      .where(
        and(
          eq(sends.hash, fill.orderId),
          eq(sends.userId, owner.userId),
          eq(sends.walletId, owner.walletId),
          eq(sends.state, "pending")
        )
      )
    if (rows.length) await bumpTradeHistory(tx, owner.userId, [owner.walletId])
  })
}

export async function noteRobinhoodTransaction(
  owner: RobinhoodOwner,
  marketId: string,
  note: string,
  action: "placed" | "refused" = "placed"
): Promise<void> {
  await tradeDb.insert(tradeLiveJournal).values({
    ...owner,
    id: randomUUID(),
    marketKey: key(marketId),
    action,
    side: null,
    px: 0,
    sz: 0,
    note,
  })
}

/** The notes a swap's Journal row opens to: hashes, fees and approvals. */
export async function robinhoodExecutionNotes(
  userId: string,
  walletIds: string[],
  orderIds: string[]
): Promise<Map<string, string>> {
  if (!walletIds.length || !orderIds.length) return new Map()
  const rows = await db
    .select({ hash: sends.hash, note: sends.note })
    .from(sends)
    .where(
      and(
        eq(sends.userId, userId),
        inArray(sends.walletId, walletIds),
        inArray(sends.hash, orderIds)
      )
    )
  return new Map(
    rows.filter((row) => row.note).map((row) => [row.hash, row.note!])
  )
}
