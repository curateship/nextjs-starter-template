import { randomUUID } from "node:crypto"
import { and, eq, sql, inArray } from "drizzle-orm"
import { db } from "@/server/db"
import { db as tradeDb } from "@/server/trade/db"
import {
  tradeLiveFills,
  tradeLiveJournal,
  tradeBnbTransactions as bnbTransactions,
} from "@/server/trade/schema"
import { bumpTradeHistory } from "@/server/trade/history-version"
import type { WalletOrderFill } from "@/lib/protocols/contracts"
import { bnbRefusalError } from "./refusals"

export type BnbApproval = { hash: string; feeBnb: number }
export type BnbOwner = { userId: string; walletId: string }
/** A second worker cannot allocate the same chain nonce for this address. */
export async function withBnbSendLock<T>(
  address: string,
  work: () => Promise<T>
): Promise<T> {
  let completed: { value: T } | undefined
  try {
    return await tradeDb.transaction(async (tx) => {
      const result = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${`bnb:${address.toLowerCase()}`}, 0)) as locked`
      )
      if (!result.rows[0]?.locked) throw bnbRefusalError("pending")
      const pending = await tx
        .select({ hash: bnbTransactions.hash })
        .from(bnbTransactions)
        .where(
          and(
            eq(bnbTransactions.address, address.toLowerCase()),
            eq(bnbTransactions.state, "pending")
          )
        )
        .limit(1)
      if (pending.length)
        throw bnbRefusalError("pending", { hash: pending[0].hash })
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
export async function rememberBnbSend(
  owner: BnbOwner,
  input: {
    hash: string
    address: string
    marketId: string
    kind: "approval" | "swap"
    approvals?: BnbApproval[]
  }
): Promise<void> {
  await db
    .insert(bnbTransactions)
    .values({
      ...owner,
      ...input,
      address: input.address.toLowerCase(),
      state: "pending",
    })
    .onConflictDoNothing()
}
export async function pendingBnbSends(owner: BnbOwner) {
  return db
    .select()
    .from(bnbTransactions)
    .where(
      and(
        eq(bnbTransactions.userId, owner.userId),
        eq(bnbTransactions.walletId, owner.walletId),
        eq(bnbTransactions.state, "pending")
      )
    )
}
export async function finishBnbSend(
  owner: BnbOwner,
  hash: string,
  state: "confirmed" | "failed",
  note: string
): Promise<void> {
  await db
    .update(bnbTransactions)
    .set({ state, note })
    .where(
      and(
        eq(bnbTransactions.hash, hash),
        eq(bnbTransactions.userId, owner.userId),
        eq(bnbTransactions.walletId, owner.walletId),
        eq(bnbTransactions.state, "pending")
      )
    )
}
export async function recordBnbFill(
  owner: BnbOwner,
  fill: WalletOrderFill
): Promise<void> {
  await tradeDb.transaction(async (tx) => {
    const rows = await tx
      .insert(tradeLiveFills)
      .values({ ...owner, ...fill, marketKey: `bnb:mainnet:${fill.marketId}` })
      .onConflictDoNothing()
      .returning({ id: tradeLiveFills.fillId })
    await tx
      .update(bnbTransactions)
      .set({
        state: "confirmed",
        note: fill.executionNote ?? "Swap confirmed.",
      })
      .where(
        and(
          eq(bnbTransactions.hash, fill.orderId),
          eq(bnbTransactions.userId, owner.userId),
          eq(bnbTransactions.walletId, owner.walletId),
          eq(bnbTransactions.state, "pending")
        )
      )
    if (rows.length) await bumpTradeHistory(tx, owner.userId, [owner.walletId])
  })
}
export async function noteBnbTransaction(
  owner: BnbOwner,
  marketId: string,
  note: string,
  action: "placed" | "refused" = "placed"
): Promise<void> {
  await tradeDb.insert(tradeLiveJournal).values({
    ...owner,
    id: randomUUID(),
    marketKey: `bnb:mainnet:${marketId}`,
    action,
    side: null,
    px: 0,
    sz: 0,
    note,
  })
}

/** Notes are protocol-specific; shared fills keep their existing database shape. */
export async function bnbExecutionNotes(
  userId: string,
  walletIds: string[],
  orderIds: string[]
): Promise<Map<string, string>> {
  if (!walletIds.length || !orderIds.length) return new Map()
  const rows = await db
    .select({ hash: bnbTransactions.hash, note: bnbTransactions.note })
    .from(bnbTransactions)
    .where(
      and(
        eq(bnbTransactions.userId, userId),
        inArray(bnbTransactions.walletId, walletIds),
        inArray(bnbTransactions.hash, orderIds)
      )
    )
  return new Map(
    rows.filter((row) => row.note).map((row) => [row.hash, row.note!])
  )
}
