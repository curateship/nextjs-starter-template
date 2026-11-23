import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LiveFill } from "@/lib/trade/live-trades"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { recordEngineError } from "@/server/trade/engine-errors"
import { carryOrderAim, recordOrderAim, stampFillAims } from "@/server/trade/order-aims"
import { tradeOrderAims, tradeWallets } from "@/server/trade/schema"

vi.mock("@/server/trade/engine-errors", () => ({ recordEngineError: vi.fn() }))

/**
 * The aims behind the Slippage columns (Tyler, 10 Nov 2026: "aimed vs
 * filled"): written once per order after the exchange answers, carried to an
 * order put back under a new id, and read onto fills by their order id.
 */

const MARKET = "hyperliquid:mainnet:BTC"

let client: PGlite
let database: CustomShellDb
let userId: string
let walletId: string

beforeEach(async () => {
  const test = await createTestDatabase()
  client = test.client
  database = test.db
  vi.mocked(recordEngineError).mockReset()
  userId = (await insertUser(database)).id
  walletId = crypto.randomUUID()
  await database.insert(tradeWallets).values({
    userId,
    id: walletId,
    label: "Live",
    kind: "live",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 0,
    address: "0x1111111111111111111111111111111111111111",
  })
})

afterEach(async () => {
  await client.close()
})

function fill(orderId: string, px: number): LiveFill {
  return {
    fillId: `fill-${orderId}`,
    orderId,
    walletId,
    marketKey: MARKET,
    side: "buy",
    px,
    sz: 1,
    at: 1,
    closedPnl: 0,
    fee: 0,
    dir: "Open Long",
    liquidation: false,
  }
}

const aim = (orderId: string, aimedPx: number) => ({
  userId,
  walletId,
  orderId,
  marketKey: MARKET,
  side: "buy" as const,
  aimedPx,
})

describe("an order's aim", () => {
  it("is written once: a second write for the same order keeps the first price", async () => {
    await recordOrderAim(aim("order-1", 100), database)
    await recordOrderAim(aim("order-1", 105), database)
    const rows = await database.select().from(tradeOrderAims)
    expect(rows.map((row) => row.aimedPx)).toEqual([100])
  })

  it("is not written without a usable price", async () => {
    await recordOrderAim(aim("order-1", Number.NaN), database)
    await recordOrderAim(aim("order-2", 0), database)
    expect(await database.select().from(tradeOrderAims)).toEqual([])
  })

  it("never throws when the write fails, so a placed order stays placed", async () => {
    await client.close()
    await expect(recordOrderAim(aim("order-1", 100), database)).resolves.toBeUndefined()
    expect(recordEngineError).toHaveBeenCalledOnce()
    // A fresh database for afterEach to close.
    client = (await createTestDatabase()).client
  })

  it("is carried to an order put back under a new id", async () => {
    await recordOrderAim(aim("old-order", 100), database)
    await carryOrderAim({ userId, walletId, orderId: "old-order" }, "new-order", database)
    const rows = await database.select().from(tradeOrderAims)
    expect(rows.find((row) => row.orderId === "new-order")?.aimedPx).toBe(100)
  })

  it("carries nothing from an order that had no aim", async () => {
    await carryOrderAim({ userId, walletId, orderId: "unknown" }, "new-order", database)
    expect(await database.select().from(tradeOrderAims)).toEqual([])
  })
})

describe("aims on fills", () => {
  it("puts each order's aim on its fill, a stop's or target's level on it, and nothing on the rest", async () => {
    await recordOrderAim(aim("order-1", 100), database)
    const fills = [fill("order-1", 101), fill("stop-order", 95), fill("target-order", 120), fill("someone-else", 99)]
    const levels = new Map([
      [`${walletId}:stop-order`, 96],
      [`${walletId}:target-order`, 121],
      // Another wallet's order of the same id is not this fill's.
      ["other-wallet:someone-else", 50],
    ])
    await stampFillAims(userId, [walletId], fills, levels, database)
    expect(fills.map((one) => one.aimedPx)).toEqual([100, 96, 121, undefined])
  })
})
