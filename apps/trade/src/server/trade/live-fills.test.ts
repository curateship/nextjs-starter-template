import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { TradeWallet } from "@/lib/trade/wallets"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { recordLiveFills, sweepWaitMs } from "@/server/trade/live-fills"
import { tradeLiveFills, tradeWallets } from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const test = await createTestDatabase()
  client = test.client
  database = test.db
})

afterEach(async () => {
  await client.close()
})

describe("how often a wallet's history is read", () => {
  it("slows down when nobody is looking, and never stops", () => {
    // The Journal is only DRAWN when it is open, but the record behind it is
    // what sends the bell notice. The engine keeps that record only for
    // wallets running ladders, so a plain wallet holding one position has
    // nothing else — and a stop firing at three in the morning would go
    // unannounced until somebody next opened the page. That is the bug this
    // pins: unwatched means slower, never off.
    expect(sweepWaitMs(true)).toBe(30_000)
    expect(sweepWaitMs(false)).toBe(120_000)
    expect(Number.isFinite(sweepWaitMs(false))).toBe(true)
    expect(sweepWaitMs(false)).toBeGreaterThan(sweepWaitMs(true))
  })
})

describe("live fill storage", () => {
  it("stores the same pushed and recovered fill once", async () => {
    const user = await insertUser(database)
    const wallet: TradeWallet = {
      id: crypto.randomUUID(),
      label: "Aster",
      kind: "live",
      status: "active",
      protocol: "aster",
      network: "testnet",
      startingBalance: 0,
      address: "0x1111111111111111111111111111111111111111",
      hasKey: true,
      keyValidUntil: null,
    }
    await database.insert(tradeWallets).values({
      userId: user.id,
      id: wallet.id,
      label: wallet.label,
      kind: wallet.kind,
      status: wallet.status,
      protocol: wallet.protocol,
      network: wallet.network,
      startingBalance: 0,
      address: wallet.address,
      agentKeyEncrypted: "encrypted-test-value",
    })
    const fill = {
      fillId: "88",
      orderId: "42",
      marketId: "BTCUSDT",
      side: "sell" as const,
      px: 101,
      sz: 0.25,
      at: 1234,
      closedPnl: 2.5,
      fee: 0.01,
      dir: "Close long",
      liquidation: false,
    }

    await recordLiveFills(user.id, wallet, [fill])
    await recordLiveFills(user.id, wallet, [fill])

    const rows = await database
      .select()
      .from(tradeLiveFills)
      .where(eq(tradeLiveFills.userId, user.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].fillId).toBe("88")
  })
})
