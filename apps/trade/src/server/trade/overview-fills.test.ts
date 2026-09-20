import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  tradeGridOrderRungs,
  tradeLiveFills,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"
import { loadOverviewFills } from "@/server/trade/trading-overview"

/**
 * What the overview, the P&L page and the daily goal say one sale made.
 *
 * The case below is the one every grid runs into. Two rungs are holding, the
 * cheaper one sells for more than it paid, and the exchange still calls it
 * nothing — because it books the sale against the average of both rungs, and
 * the rung still holding is the expensive one.
 */
const BTC = "hyperliquid:mainnet:BTC"

let client: PGlite
let database: CustomShellDb
let userId: string

const wallet = {
  id: "w1",
  label: "Real",
  protocol: "hyperliquid" as const,
}

async function gridFills() {
  await database.insert(tradeSmartLadders).values({
    userId,
    id: "grid-1",
    walletId: wallet.id,
    marketKey: BTC,
    status: "active",
    kind: "grid",
    // Deliberately empty: what names each rung here is the record the engine
    // wrote when it sent the order, which is what a real grid relies on too.
    plan: {} as unknown as (typeof tradeSmartLadders.$inferInsert)["plan"],
    createdAt: new Date(1_000),
    updatedAt: new Date(1_000),
  })
  await database.insert(tradeGridOrderRungs).values([
    {
      userId,
      walletId: wallet.id,
      orderId: "buy-rung-1",
      ladderId: "grid-1",
      marketKey: BTC,
      direction: "long",
      rung: 1,
    },
    {
      userId,
      walletId: wallet.id,
      orderId: "buy-rung-2",
      ladderId: "grid-1",
      marketKey: BTC,
      direction: "long",
      rung: 2,
    },
    {
      userId,
      walletId: wallet.id,
      orderId: "sell-rung-2",
      ladderId: "grid-1",
      marketKey: BTC,
      direction: "long",
      rung: 2,
    },
  ])
  await database.insert(tradeLiveFills).values([
    {
      userId,
      walletId: wallet.id,
      fillId: "buy-1",
      orderId: "buy-rung-1",
      marketKey: BTC,
      side: "buy",
      px: 1,
      sz: 100,
      at: 2_000,
      closedPnl: 0,
      fee: 0,
      dir: "Open Long",
      liquidation: false,
      hidden: false,
    },
    {
      userId,
      walletId: wallet.id,
      fillId: "buy-2",
      orderId: "buy-rung-2",
      marketKey: BTC,
      side: "buy",
      px: 0.9,
      sz: 100,
      at: 3_000,
      closedPnl: 0,
      fee: 0,
      dir: "Open Long",
      liquidation: false,
      hidden: false,
    },
    {
      // $95 in for coins that cost $90. The venue holds 200 coins at an
      // average of $0.95, so it books this sale as nothing earned.
      userId,
      walletId: wallet.id,
      fillId: "sell-2",
      orderId: "sell-rung-2",
      marketKey: BTC,
      side: "sell",
      px: 0.95,
      sz: 100,
      at: 4_000,
      closedPnl: 0,
      fee: 0,
      dir: "Close Long",
      liquidation: false,
      hidden: false,
    },
  ])
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  userId = (await insertUser(database)).id
  await database.insert(tradeWallets).values({
    userId,
    id: wallet.id,
    label: wallet.label,
    kind: "live",
    status: "active",
    protocol: wallet.protocol,
    network: "mainnet",
    startingBalance: 1_000,
  })
})

afterEach(async () => {
  await client.close()
})

describe("what the overview says a grid sale made", () => {
  it("pays the rung what its own coins made, not the blended average", async () => {
    await gridFills()

    const fills = await loadOverviewFills(userId, [wallet])
    const sale = fills.find((fill) => fill.fillId === "sell-2")

    expect(sale?.money).toBeCloseTo(5, 9)
  })

  it("leaves a sale with no grid behind it on the venue's own figure", async () => {
    await database.insert(tradeLiveFills).values({
      userId,
      walletId: wallet.id,
      fillId: "hand-sale",
      orderId: "hand-order",
      marketKey: BTC,
      side: "sell",
      px: 0.95,
      sz: 100,
      at: 5_000,
      closedPnl: 7,
      fee: 1,
      dir: "Close Long",
      liquidation: false,
      hidden: false,
    })

    const fills = await loadOverviewFills(userId, [wallet])

    expect(fills[0]).toMatchObject({ fillId: "hand-sale", money: 6 })
  })
})
