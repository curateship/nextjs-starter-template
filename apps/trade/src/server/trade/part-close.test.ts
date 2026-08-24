import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WatchPlan } from "@/lib/trade/watch-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { loadPaperPortfolio, placePaperOrder } from "@/server/trade/paper"
import { openPartClose } from "@/server/trade/part-close"
import { resetWatchChaseGate } from "@/server/trade/smart-watch"
import {
  tradePaperOrders,
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * Selling part of a position, driven through real settles the way the watch,
 * ladder and grid suites are.
 *
 * **Three claims these defend.** A part close never takes the market, however
 * far the price moves — that is the whole reason it exists rather than being
 * the close button with a number on it. It sells the piece that was asked for
 * and leaves the rest. And an amount that turns out to be the whole position
 * says so, rather than quietly selling all of it down a path built for a part.
 */

const marks = new Map<string, number>([["BTC", 100]])

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    id: "hyperliquid",
    label: "Hyperliquid",
    markets: {
      fetch: async () => ({
        protocol: "hyperliquid",
        protocolLabel: "Hyperliquid",
        network: "mainnet",
        networkLabel: "Mainnet",
        rows: [
          {
            key: "hyperliquid:mainnet:BTC",
            marketId: "BTC",
            symbol: "BTC",
            subExchange: null,
            category: "crypto",
            sizeDecimals: 3,
            // A stated dollar floor, so the "what is left would be too small
            // to be an order" rule has something to measure against.
            minOrderValueUsd: 10,
            maxLeverage: 50,
            isolatedOnly: false,
            iconUrl: null,
            price: marks.get("BTC") ?? 100,
            change24h: null,
            volume24hUsd: 0,
            fundingHourly: null,
            openInterestUsd: null,
          },
        ],
      }),
      prices: async (_network: string, ids: readonly string[]) =>
        new Map(
          ids
            .filter((id) => marks.has(id))
            .map((id) => [id, marks.get(id) as number])
        ),
      candles: async () => [],
      roundPx: (px: number) => Math.round(px * 1000) / 1000,
    },
    account: { fetch: async () => null },
  }),
}))

const BTC = "hyperliquid:mainnet:BTC"

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet

async function settle() {
  await loadPaperPortfolio(userId, [wallet])
}

async function priceTo(px: number) {
  marks.set("BTC", px)
  await settle()
}

async function orders() {
  return await database
    .select()
    .from(tradePaperOrders)
    .where(eq(tradePaperOrders.userId, userId))
}

async function held() {
  return await database
    .select()
    .from(tradePaperPositions)
    .where(eq(tradePaperPositions.userId, userId))
}

async function watchRow() {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
  expect(rows).toHaveLength(1)
  return { ...rows[0], plan: rows[0].plan as WatchPlan }
}

/** Ten coins of BTC held at $100, bought at the market. */
async function openTen() {
  await placePaperOrder(userId, wallet, {
    marketKey: BTC,
    side: "buy",
    px: 100,
    sz: 10,
    leverage: 1,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
  })
  await settle()
  expect((await held())[0].szi).toBeCloseTo(10, 6)
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  resetWatchChaseGate()
  marks.set("BTC", 100)
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-24T00:00:00Z"))

  userId = (await insertUser(database)).id
  await database.insert(tradeWallets).values({
    userId,
    id: "w1",
    label: "Practice",
    kind: "paper",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
  })
  wallet = {
    id: "w1",
    label: "Practice",
    kind: "paper",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
    address: null,
    hasKey: false,
    keyValidUntil: null,
  }
})

afterEach(async () => {
  vi.useRealTimers()
  await client.close()
})

describe("selling part of a position", () => {
  it("writes a chasing maker order for the piece asked for", async () => {
    await openTen()
    const answer = await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })
    expect(answer).toEqual({ kind: "chasing", sz: 4, px: 100 })

    const row = await watchRow()
    expect(row.kind).toBe("watch")
    // A sell, only ever reducing, never taking the market, and never giving up.
    expect(row.plan.side).toBe("sell")
    expect(row.plan.sz).toBeCloseTo(4, 6)
    expect(row.plan.reduceOnly).toBe(true)
    expect(row.plan.maker).toBe(true)
    expect(row.plan.chaseGiveUp).toBe(0)
    // It has nothing to wait for, so it starts already taking.
    expect(row.plan.phase).toBe("taking")
    // Nothing has been sent anywhere yet — the engine's next pass does that.
    expect(row.plan.sent).toBe(false)
    expect(await orders()).toHaveLength(0)
  })

  it("turns dollars into coins at the price on arrival", async () => {
    await openTen()
    // The confirm showed $250 at $100. By the time the press lands the coin is
    // at $125, and $250 is two coins there, not two and a half.
    await priceTo(125)
    const answer = await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "usd", amount: 250 },
    })
    expect(answer).toEqual({ kind: "chasing", sz: 2, px: 125 })
  })

  it("rests a reduce-only sell off the market and never takes it", async () => {
    await openTen()
    await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })

    // The price runs a long way UP, which for an ordinary watch is the case
    // that takes the market. A close must not: it rests above and follows.
    await priceTo(140)
    const resting = await orders()
    expect(resting).toHaveLength(1)
    expect(resting[0].side).toBe("sell")
    expect(resting[0].reduceOnly).toBe(true)
    expect(resting[0].sz).toBeCloseTo(4, 6)
    expect(resting[0].px).toBeGreaterThan(140)
    // Nothing sold: the position is exactly as it was.
    expect((await held())[0].szi).toBeCloseTo(10, 6)
  })

  it("sells the piece and leaves the rest running with its stop", async () => {
    await openTen()
    // A stop under the whole position, so the remainder can be checked for it.
    await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })
    await priceTo(140)
    // The market comes back up through the resting sell and it fills.
    const resting = (await orders())[0]
    await priceTo(resting.px + 1)

    expect(await orders()).toHaveLength(0)
    const rest = await held()
    expect(rest).toHaveLength(1)
    expect(rest[0].szi).toBeCloseTo(6, 6)
  })

  it("never asks for more than is left after a part fill", async () => {
    await openTen()
    await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })
    await priceTo(140)

    // Half the piece is taken by hand, standing in for a partial fill: the
    // order goes, and the holding is down by two. The chase must then ask for
    // the two that are LEFT, not the four it started with. Asking for four
    // again is how selling part of a position sells six coins of ten.
    const resting = (await orders())[0]
    await database
      .delete(tradePaperOrders)
      .where(eq(tradePaperOrders.id, resting.id))
    await database
      .update(tradePaperPositions)
      .set({ szi: 8 })
      .where(eq(tradePaperPositions.userId, userId))

    // Far enough for the chase to think the order is worth moving.
    await priceTo(200)
    const again = await orders()
    expect(again).toHaveLength(1)
    expect(again[0].sz).toBeCloseTo(2, 6)
  })

  it("stops once the holding has come down by the whole piece", async () => {
    await openTen()
    await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })
    await priceTo(140)
    await database
      .delete(tradePaperOrders)
      .where(eq(tradePaperOrders.userId, userId))
    await database
      .update(tradePaperPositions)
      .set({ szi: 6 })
      .where(eq(tradePaperPositions.userId, userId))

    await priceTo(200)
    expect(await orders()).toHaveLength(0)
    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, userId))
    expect(rows[0].status).toBe("done")
  })

  it("says the whole position when the amount covers it", async () => {
    await openTen()
    expect(
      await openPartClose(userId, wallet, {
        marketKey: BTC,
        size: { unit: "coins", amount: 10 },
      })
    ).toEqual({ kind: "whole" })
    // Nothing written: the caller closes it the ordinary way instead.
    expect(
      await database
        .select()
        .from(tradeSmartLadders)
        .where(eq(tradeSmartLadders.userId, userId))
    ).toHaveLength(0)
  })

  it("counts dollars worth more than the position as the whole thing", async () => {
    // The window quoted "all of it, $1,000" at $100. The coin fell to $80
    // before the press landed, so $1,000 is 12.5 coins where 10 are held. That
    // is a plain "all of it" on a falling market, not a mistake to refuse.
    await openTen()
    await priceTo(80)
    expect(
      await openPartClose(userId, wallet, {
        marketKey: BTC,
        size: { unit: "usd", amount: 1_000 },
      })
    ).toEqual({ kind: "whole" })
  })

  it("sells all of it when the piece left would be too small to be an order", async () => {
    // Nine and a bit of ten coins. What is left is worth $5, under this
    // market's $10 floor, so it could never be closed on its own — the whole
    // position goes instead of leaving a scrap nothing can sell.
    await openTen()
    expect(
      await openPartClose(userId, wallet, {
        marketKey: BTC,
        size: { unit: "coins", amount: 9.95 },
      })
    ).toEqual({ kind: "whole" })
  })

  it("refuses a piece too small to be an order", async () => {
    await openTen()
    await expect(
      openPartClose(userId, wallet, {
        marketKey: BTC,
        size: { unit: "coins", amount: 0.0001 },
      })
    ).rejects.toThrow(/PART_CLOSE_TOO_SMALL/)
  })

  it("refuses when the position is not there", async () => {
    await expect(
      openPartClose(userId, wallet, {
        marketKey: BTC,
        size: { unit: "coins", amount: 1 },
      })
    ).rejects.toThrow("PART_CLOSE_POSITION_GONE")
  })

  it("brings a fixed-size target down to what will be left", async () => {
    await openTen()
    // A target selling 8 of the 10. After 4 come off there are 6, and a target
    // for 8 is one the exchange refuses when it fires.
    await database
      .update(tradePaperPositions)
      .set({ tpPx: 150, tpSz: 8, slPx: 90 })
      .where(eq(tradePaperPositions.userId, userId))

    await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })
    const after = (await held())[0]
    expect(after.tpSz).toBeCloseTo(6, 6)
    expect(after.tpPx).toBeCloseTo(150, 6)
    expect(after.slPx).toBeCloseTo(90, 6)
  })

  it("leaves a whole-position target alone, because it shrinks by itself", async () => {
    await openTen()
    await database
      .update(tradePaperPositions)
      .set({ tpPx: 150, tpSz: null, slPx: 90 })
      .where(eq(tradePaperPositions.userId, userId))

    await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })
    expect((await held())[0].tpSz).toBeNull()
  })

  it("keeps the nearest targets and trims the last one when a part close leaves less coin", async () => {
    await openTen()
    await database
      .update(tradePaperPositions)
      .set({
        targets: [
          { px: 120, sz: 4, orderId: null },
          { px: 130, sz: 4, orderId: null },
          { px: 140, sz: 2, orderId: null },
        ],
        tpPx: 120,
        tpSz: 4,
        slPx: 90,
      })
      .where(eq(tradePaperPositions.userId, userId))

    await openPartClose(userId, wallet, {
      marketKey: BTC,
      size: { unit: "coins", amount: 4 },
    })
    const after = (await held())[0]
    expect(after.targets).toEqual([
      { px: 120, sz: 4, orderId: null },
      { px: 130, sz: 2, orderId: null },
    ])
    expect(after.tpPx).toBe(120)
    expect(after.tpSz).toBe(4)
    expect(after.slPx).toBe(90)
  })
})
