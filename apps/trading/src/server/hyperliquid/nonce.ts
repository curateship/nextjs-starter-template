import { sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { tradingWalletNonces } from "@/server/schema"
import type { TradingNetwork } from "@/server/hyperliquid/types"

/**
 * Allocates the next Hyperliquid nonce for an agent wallet.
 *
 * Nonces are per (account, signer) pair on Hyperliquid, must be monotonic,
 * and must stay within (now - 2 days, now + 1 day). A single atomic upsert
 * serializes all producers (web app and worker) that share this database:
 * the counter fast-forwards to the current millisecond timestamp and only
 * increments past it when multiple nonces are allocated within the same ms.
 */
export async function allocateNonce(
  agentAddress: string,
  network: TradingNetwork,
  database: CustomShellDb = db
): Promise<number> {
  const nowMs = Date.now()
  const [row] = await database
    .insert(tradingWalletNonces)
    .values({
      agentAddress: agentAddress.toLowerCase(),
      network,
      lastNonce: nowMs,
    })
    .onConflictDoUpdate({
      target: [tradingWalletNonces.agentAddress, tradingWalletNonces.network],
      set: {
        lastNonce: sql`greatest(${tradingWalletNonces.lastNonce} + 1, ${nowMs})`,
      },
    })
    .returning({ lastNonce: tradingWalletNonces.lastNonce })

  if (!row) {
    throw new Error("Nonce allocation failed")
  }
  return row.lastNonce
}
