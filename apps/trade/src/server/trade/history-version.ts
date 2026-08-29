import { and, eq, inArray, sql } from "drizzle-orm"

import type { CustomShellDb } from "@/server/db"
import { db } from "@/server/db"
import { tradeWallets } from "@/server/trade/schema"

/** Atomically records that one or more wallets' visible history changed. */
export async function bumpTradeHistory(
  database: CustomShellDb,
  userId: string,
  walletIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(walletIds)]
  if (ids.length === 0) return
  await database
    .update(tradeWallets)
    .set({ historyVersion: sql`${tradeWallets.historyVersion} + 1` })
    .where(and(eq(tradeWallets.userId, userId), inArray(tradeWallets.id, ids)))
}

/**
 * One small indexed read for the question each poll asks: has any selected
 * wallet's Journal changed since the last answer?
 */
export async function tradeHistoryStamp(
  userId: string,
  walletIds: readonly string[]
): Promise<string> {
  const ids = [...new Set(walletIds)]
  if (ids.length === 0) return "0"
  const rows = await db
    .select({ id: tradeWallets.id, version: tradeWallets.historyVersion })
    .from(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), inArray(tradeWallets.id, ids)))
  return rows
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => `${row.id}:${row.version}`)
    .join("|")
}
