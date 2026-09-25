import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { windowStart } from "@/lib/trade/public-profile/figures"
import { customShellUsers } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  tradeGridOrderRungs,
  tradeLiveFills,
  tradeRecordFills,
  tradeRecordWallets,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"
import { loadPricedRecord } from "@/server/trade/trade-record"
import { loadOverviewFills } from "@/server/trade/trading-overview"
import { deleteWallet } from "@/server/trade/wallets"

/**
 * The permanent record a public profile reads. The rules it proves are the
 * task's acceptance list: binning changes nothing, a deleted wallet's trades
 * stay, practice and testnet trades never get in, and the 30-day figure is
 * the P&L page's.
 */
const NOW = Date.now()
const DAY = 86_400_000
const BTC = "hyperliquid:mainnet:BTC"
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"

let client: PGlite
let database: CustomShellDb
let userId: string

async function addWallet(
  id: string,
  kind: "live" | "paper" = "live",
  network: "mainnet" | "testnet" = "mainnet",
  address: string | null = ADDRESS
) {
  await database.insert(tradeWallets).values({
    userId,
    id,
    label: id,
    kind,
    protocol: "hyperliquid",
    network,
    startingBalance: 1_000,
    address: kind === "live" ? address : null,
  })
}

/** One whole trade: a buy, then a sell `money` dollars better, fee $1 each. */
async function addTrade(
  walletId: string,
  fillPrefix: string,
  at: number,
  money: number
) {
  await database.insert(tradeLiveFills).values([
    {
      userId,
      walletId,
      fillId: `${fillPrefix}-buy`,
      orderId: `${fillPrefix}-o1`,
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 1,
      at,
      closedPnl: 0,
      fee: 1,
      dir: "Open Long",
    },
    {
      userId,
      walletId,
      fillId: `${fillPrefix}-sell`,
      orderId: `${fillPrefix}-o2`,
      marketKey: BTC,
      side: "sell",
      px: 100 + money,
      sz: 1,
      at: at + 60_000,
      closedPnl: money,
      fee: 1,
      dir: "Close Long",
    },
  ])
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  userId = (await insertUser(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("the permanent trade record", () => {
  it("counts a binned trade exactly as before it was binned", async () => {
    await addWallet("w1")
    await addTrade("w1", "t1", NOW - 3 * DAY, 50)
    const before = await loadPricedRecord(userId, NOW)

    await database
      .update(tradeLiveFills)
      .set({ hidden: true })
      .where(eq(tradeLiveFills.userId, userId))
    const after = await loadPricedRecord(userId, NOW)

    expect(before.figures.made["30d"].money).toBe(48)
    expect(after.figures).toEqual(before.figures)
  })

  it("keeps a deleted wallet's trades, marked removed", async () => {
    await addWallet("w1")
    await addTrade("w1", "t1", NOW - 3 * DAY, 50)
    await deleteWallet(userId, "w1")

    const record = await loadPricedRecord(userId, NOW)
    expect(record.figures.made.all.money).toBe(48)
    expect(record.figures.closedTrades).toBe(1)
    expect(record.wallets).toHaveLength(1)
    expect(record.wallets[0].removedAt).not.toBeNull()

    const [frozen] = await database
      .select()
      .from(tradeRecordFills)
      .where(eq(tradeRecordFills.fillId, "t1-sell"))
    expect(frozen).toMatchObject({ frozen: true, money: 49 })
  })

  it("never takes in a practice or testnet wallet's trades", async () => {
    await addWallet("paper", "paper")
    await addWallet("test", "live", "testnet")
    await addTrade("test", "t1", NOW - DAY, 500)

    const record = await loadPricedRecord(userId, NOW)
    expect(record.wallets).toEqual([])
    expect(record.figures.made.all.money).toBe(0)
  })

  it("copies an exchange's later correction of a sale's money", async () => {
    await addWallet("w1")
    await addTrade("w1", "t1", NOW - DAY, 0)
    await database
      .update(tradeLiveFills)
      .set({ closedPnl: 30 })
      .where(eq(tradeLiveFills.fillId, "t1-sell"))

    const record = await loadPricedRecord(userId, NOW)
    expect(record.figures.made.all.money).toBe(28)
  })

  it("does not count a fill twice when a deleted wallet is added again", async () => {
    await addWallet("w1")
    await addTrade("w1", "t1", NOW - DAY, 50)
    await deleteWallet(userId, "w1")
    await addWallet("w2")
    await addTrade("w2", "t1", NOW - DAY, 50)

    const record = await loadPricedRecord(userId, NOW)
    expect(record.figures.made.all.money).toBe(48)
    expect(record.figures.closedTrades).toBe(1)
  })

  it("says the same 30 days as the P&L page's own fills", async () => {
    await addWallet("w1")
    await addTrade("w1", "t1", NOW - 40 * DAY, 500)
    await addTrade("w1", "t2", NOW - 10 * DAY, -120)
    await addTrade("w1", "t3", NOW - DAY, 75)

    const record = await loadPricedRecord(userId, NOW)
    const since = windowStart(30, NOW)
    const pnlPage = (
      await loadOverviewFills(userId, [
        { id: "w1", label: "w1", protocol: "hyperliquid" },
      ])
    )
      .filter((fill) => fill.at >= since)
      .reduce((sum, fill) => sum + (fill.money ?? 0), 0)

    expect(record.figures.made["30d"].money).toBe(pnlPage)
    expect(record.figures.made["30d"].money).toBe(-49)
  })

  it("leaves a wallet whose ownership check failed out of the figures", async () => {
    await addWallet("w1")
    await addTrade("w1", "t1", NOW - DAY, 50)
    await database
      .update(tradeRecordWallets)
      .set({
        proof: "failed",
        proofNote: "The exchange does not accept that key.",
      })
      .where(eq(tradeRecordWallets.walletId, "w1"))

    const record = await loadPricedRecord(userId, NOW)
    expect(record.figures.made.all.money).toBe(0)
    expect(record.wallets[0]).toMatchObject({
      check: "failed",
      checkNote: "The exchange does not accept that key.",
    })
  })

  it("counts an open position without naming it", async () => {
    await addWallet("w1")
    await database.insert(tradeLiveFills).values({
      userId,
      walletId: "w1",
      fillId: "open-buy",
      orderId: "o",
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 2,
      at: NOW - DAY,
      dir: "Open Long",
    })

    expect((await loadPricedRecord(userId, NOW)).openPositions).toBe(1)
  })

  it("goes with the account when the whole account is deleted", async () => {
    await addWallet("w1")
    await addTrade("w1", "t1", NOW - DAY, 50)
    await database
      .delete(customShellUsers)
      .where(eq(customShellUsers.id, userId))

    const left = await database
      .select()
      .from(tradeRecordFills)
      .where(and(eq(tradeRecordFills.userId, userId)))
    expect(left).toEqual([])
  })

  it("prices a grid's sale on its own rung, before and after the wallet is deleted", async () => {
    await addWallet("w1")
    const start = NOW - 5 * DAY
    await database.insert(tradeSmartLadders).values({
      userId,
      id: "grid-1",
      walletId: "w1",
      marketKey: BTC,
      status: "active",
      kind: "grid",
      plan: {} as unknown as (typeof tradeSmartLadders.$inferInsert)["plan"],
      createdAt: new Date(start),
      updatedAt: new Date(start),
    })
    await database.insert(tradeGridOrderRungs).values(
      ["buy-rung-1", "buy-rung-2", "sell-rung-2"].map((orderId) => ({
        userId,
        walletId: "w1",
        orderId,
        ladderId: "grid-1",
        marketKey: BTC,
        direction: "long" as const,
        rung: orderId.endsWith("1") ? 1 : 2,
      }))
    )
    // Two rungs hold, the $0.90 one sells at $0.95. The exchange books it
    // against the $0.95 average and calls it nothing; the rung made $5.
    const fill = (
      fillId: string,
      orderId: string,
      side: "buy" | "sell",
      px: number,
      at: number
    ) => ({
      userId,
      walletId: "w1",
      fillId,
      orderId,
      marketKey: BTC,
      side,
      px,
      sz: 100,
      at,
      dir: side === "buy" ? "Open Long" : "Close Long",
    })
    await database
      .insert(tradeLiveFills)
      .values([
        fill("buy-1", "buy-rung-1", "buy", 1, start + 1_000),
        fill("buy-2", "buy-rung-2", "buy", 0.9, start + 2_000),
        fill("sell-2", "sell-rung-2", "sell", 0.95, start + 3_000),
      ])

    const before = await loadPricedRecord(userId, NOW)
    expect(before.figures.made["30d"].money).toBeCloseTo(5, 9)

    await deleteWallet(userId, "w1")
    const after = await loadPricedRecord(userId, NOW)
    expect(after.figures.made["30d"].money).toBeCloseTo(5, 9)
  })
})
