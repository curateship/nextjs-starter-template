import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { TAKER_FEE_RATE, type PaperFillReason } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import {
  cancelPaperOrder,
  closeAllPaperPositions,
  closePaperPosition,
  flipPaperPosition,
  hidePaperJournalEntries,
  loadPaperPortfolio,
  movePaperOrder,
  paperWalletFigures,
  placePaperOrder,
  setPaperBrackets,
  updatePaperOrder,
} from "@/server/trade/paper"
import {
  tradePaperJournal,
  tradePaperOrders,
  tradePaperPositions,
  tradePaperState,
  tradeWallets,
} from "@/server/trade/schema"

// The exchange is a mock: these tests are about the engine, and a real network
// call would make them slow and flaky. It answers the way the adapter does —
// a catalogue of rules, today's prices, and whatever candles a case scripts.
const marks = new Map<string, number>([["BTC", 100]])
let candles: CandleBar[] = []

// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
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
      candles: async () => candles,
      roundPx: (px: number) => px,
    },
    account: { fetch: async () => null },
  }),
}))

const BTC = "hyperliquid:mainnet:BTC"
const MINUTE = 60_000

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet

function bar(over: Partial<CandleBar>): CandleBar {
  return {
    openTime: Date.now() - 10 * MINUTE,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
    ...over,
  }
}

/** Pretends the wallet was last settled this long ago, so candles get read. */
async function lastLookedAt(msAgo: number) {
  await database
    .insert(tradePaperState)
    .values({
      userId,
      walletId: wallet.id,
      settledTo: new Date(Date.now() - msAgo),
    })
    .onConflictDoUpdate({
      target: [tradePaperState.userId, tradePaperState.walletId],
      set: { settledTo: new Date(Date.now() - msAgo) },
    })
}

async function positions() {
  return await database
    .select()
    .from(tradePaperPositions)
    .where(eq(tradePaperPositions.userId, userId))
}

async function orders() {
  return await database
    .select()
    .from(tradePaperOrders)
    .where(eq(tradePaperOrders.userId, userId))
}

async function journal() {
  return await database
    .select()
    .from(tradePaperJournal)
    .where(eq(tradePaperJournal.userId, userId))
}

async function reasons(): Promise<PaperFillReason[]> {
  const rows = await journal()
  return rows
    .sort((a, b) => a.fillTime.getTime() - b.fillTime.getTime())
    .map((row) => row.reason)
}

/** Opens a position by buying straight through the market. */
async function openLong(sz = 1, leverage = 5) {
  await placePaperOrder(userId, wallet, {
    marketKey: BTC,
    side: "buy",
    px: marks.get("BTC") as number,
    sz,
    leverage,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
  })
}

/** Opens a short position by selling straight through the market. */
async function openShort(sz = 1, leverage = 5) {
  await placePaperOrder(userId, wallet, {
    marketKey: BTC,
    side: "sell",
    px: marks.get("BTC") as number,
    sz,
    leverage,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
  })
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  marks.set("BTC", 100)
  candles = []

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
  await client.close()
})

describe("placing an order", () => {
  it("fills at once when the price asked for is already through the market", async () => {
    // Buying at 110 when it costs 100: nothing to wait for.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 110,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    const held = await positions()
    expect(held).toHaveLength(1)
    // Filled at what it actually costs, not at the worse price asked for.
    expect(held[0].entryPx).toBe(100)
    expect(held[0].leverage).toBe(5)
    expect(await orders()).toHaveLength(0)
    expect(await reasons()).toEqual(["order"])
  })

  it("fills an explicit market order even when the clicked level is not through it", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      // This would normally wait and is too small at the clicked level. At the
      // current $100 market price it is a legal $10 order.
      px: 1,
      sz: 0.1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      marketOnly: true,
    })

    const held = await positions()
    expect(held).toHaveLength(1)
    expect(held[0].entryPx).toBe(100)
    expect(held[0].szi).toBeCloseTo(0.1)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses an unchecked resting Short below market so it can be watched", async () => {
    await expect(
      placePaperOrder(userId, wallet, {
        marketKey: BTC,
        side: "sell",
        px: 90,
        sz: 1,
        leverage: 5,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
        restingOnly: true,
      })
    ).rejects.toThrow("PAPER_ORDER_NOT_RESTING")

    expect(await positions()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("leaves an order waiting when its price is not reached", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    expect(await orders()).toHaveLength(1)
    expect(await positions()).toHaveLength(0)
  })

  it("refuses an order the account cannot put up the margin for", async () => {
    // 10,000 of cash at 2x buys 20,000 of value; this asks for 100,000.
    await expect(
      placePaperOrder(userId, wallet, {
        marketKey: BTC,
        side: "buy",
        px: 100,
        sz: 1_000,
        leverage: 2,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_MARGIN")
  })

  it("checks the margin against the price it will really fill at", async () => {
    // A sell placed under the market is taken at the market, which is the
    // higher price — so it costs more margin than the price asked for suggests.
    // 150 coins at the asked-for 50 is 7,500 of margin at 1x and would pass;
    // at the real fill price of 100 it is 15,000, which the account has not got.
    await expect(
      placePaperOrder(userId, wallet, {
        marketKey: BTC,
        side: "sell",
        px: 50,
        sz: 150,
        leverage: 1,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_MARGIN")
    expect(await positions()).toHaveLength(0)
  })

  it("refuses more leverage than the market allows", async () => {
    await expect(
      placePaperOrder(userId, wallet, {
        marketKey: BTC,
        side: "buy",
        px: 100,
        sz: 1,
        leverage: 100,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_LEVERAGE")
  })

  it("refuses a reduce-only order with nothing to reduce", async () => {
    await expect(
      placePaperOrder(userId, wallet, {
        marketKey: BTC,
        side: "sell",
        px: 100,
        sz: 1,
        leverage: 5,
        reduceOnly: true,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_REDUCE_ONLY")
  })

  it("refuses brackets that would be on the wrong side of the price it fills at", async () => {
    // Buying at 110 when it costs 100 fills at 100, so a stop worked out from
    // 110 — say 2% under it, at 107.8 — sits above the entry. Taking it would
    // open a position and close it in the same breath, which is worse than
    // refusing it, because the fees would be real.
    await expect(
      placePaperOrder(userId, wallet, {
        marketKey: BTC,
        side: "buy",
        px: 110,
        sz: 1,
        leverage: 5,
        reduceOnly: false,
        tpPx: null,
        slPx: 107.8,
      })
    ).rejects.toThrow("PAPER_STOP_SIDE")
    expect(await positions()).toHaveLength(0)
    expect(await journal()).toHaveLength(0)
  })

  it("hands its target and stop to the position it opens", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 110,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: 120,
      slPx: 95,
    })
    const held = await positions()
    expect(held[0].tpPx).toBe(120)
    expect(held[0].slPx).toBe(95)
  })
})

describe("settling against the price right now", () => {
  it("fills a waiting order once price reaches it", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    marks.set("BTC", 88)
    const account = await loadPaperPortfolio(userId, [wallet])

    expect(account.orders).toHaveLength(0)
    expect(account.positions).toHaveLength(1)
    // Taken at the price it was sitting at, not at today's better one.
    expect(account.positions[0].entryPx).toBe(90)
  })

  it("takes a profit at the target price even when price has run past it", async () => {
    await openLong()
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [{ px: 120, sz: null }],
      slPx: null,
    })

    marks.set("BTC", 130)
    const account = await loadPaperPortfolio(userId, [wallet])

    expect(account.positions).toHaveLength(0)
    expect(await reasons()).toEqual(["order", "take_profit"])
    const banked = (await journal()).find((row) => row.reason === "take_profit")
    // A target is a limit at your price: running past it does not pay more.
    expect(banked?.px).toBe(120)
    expect(banked?.closedPnl).toBeCloseTo(20, 10)
  })

  it("sells only the target's size and leaves the rest running", async () => {
    await openLong(2)
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [{ px: 120, sz: 0.5 }],
      slPx: 95,
    })

    marks.set("BTC", 121)
    const account = await loadPaperPortfolio(userId, [wallet])

    // A quarter came off at the target; the rest is still on.
    expect(account.positions).toHaveLength(1)
    expect(account.positions[0].szi).toBeCloseTo(1.5, 10)
    const banked = (await journal()).find((row) => row.reason === "take_profit")
    expect(banked?.px).toBe(120)
    expect(banked?.sz).toBeCloseTo(0.5, 10)
    expect(banked?.closedPnl).toBeCloseTo(10, 10)
    // The target is used up by firing — once, not a slice per pass — while
    // the stop stays on what is left.
    expect(account.positions[0].tpPx).toBeNull()
    expect(account.positions[0].slPx).toBe(95)

    await loadPaperPortfolio(userId, [wallet])
    expect(await reasons()).toEqual(["order", "take_profit"])
  })

  it("fills several targets one at a time and keeps the stop on the remainder", async () => {
    await openLong(12)
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [
        { px: 110, sz: 4 },
        { px: 120, sz: 4 },
        { px: 135, sz: 4 },
      ],
      slPx: 90,
    })

    marks.set("BTC", 111)
    let account = await loadPaperPortfolio(userId, [wallet])
    expect(account.positions[0].szi).toBeCloseTo(8, 10)
    expect(account.positions[0].targets.map((target) => target.px)).toEqual([
      120, 135,
    ])

    marks.set("BTC", 121)
    account = await loadPaperPortfolio(userId, [wallet])
    expect(account.positions[0].szi).toBeCloseTo(4, 10)
    expect(account.positions[0].targets).toEqual([
      { px: 135, sz: 4, orderId: null },
    ])
    expect(account.positions[0].slPx).toBe(90)
    expect(
      (await journal()).filter((row) => row.reason === "take_profit")
    ).toHaveLength(2)
  })

  it("treats a target sized at the whole position as a full close", async () => {
    await openLong(2)
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [{ px: 120, sz: 2 }],
      slPx: null,
    })

    marks.set("BTC", 121)
    const account = await loadPaperPortfolio(userId, [wallet])

    expect(account.positions).toHaveLength(0)
    expect(await reasons()).toEqual(["order", "take_profit"])
  })

  it("floors the target's size to the market's step, and refuses one that floors away", async () => {
    await openLong(2)
    // This market deals in thousandths. A size with more decimals than that
    // is floored, exactly as an order's size is — practice has to model what
    // the exchange would actually take.
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [{ px: 120, sz: 0.5009999 }],
      slPx: null,
    })
    const account = await loadPaperPortfolio(userId, [wallet])
    expect(account.positions[0].tpSz).toBeCloseTo(0.5, 10)

    // Smaller than one step is not a piece of anything, so it is refused
    // rather than quietly becoming "sell everything".
    await expect(
      setPaperBrackets(userId, wallet, {
        marketKey: BTC,
        targets: [{ px: 120, sz: 0.0001 }],
        slPx: null,
      })
    ).rejects.toThrow("PAPER_TAKE_PROFIT_SIZE")
  })

  it("refuses a target selling more than the position holds", async () => {
    await openLong(1)
    await expect(
      setPaperBrackets(userId, wallet, {
        marketKey: BTC,
        targets: [{ px: 120, sz: 1.5 }],
        slPx: null,
      })
    ).rejects.toThrow("PAPER_TAKE_PROFIT_TOTAL")
  })

  it("fills a stop at the market when price has gapped through it", async () => {
    await openLong()
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [],
      slPx: 95,
    })

    marks.set("BTC", 93)
    await loadPaperPortfolio(userId, [wallet])

    const stopped = (await journal()).find((row) => row.reason === "stop_loss")
    // A stop is a market order — it takes what is actually there.
    expect(stopped?.px).toBe(93)
    expect(stopped?.closedPnl).toBeCloseTo(-7, 10)
  })

  it("liquidates a position price has run far enough against", async () => {
    await openLong(1, 5)
    // 5x on a market allowing 50x is liquidated 19% below entry.
    marks.set("BTC", 78)
    const account = await loadPaperPortfolio(userId, [wallet])

    expect(account.positions).toHaveLength(0)
    expect(await reasons()).toEqual(["order", "liquidated"])
  })

  it("takes the stop first when it sits inside the liquidation price", async () => {
    await openLong(1, 5)
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [],
      slPx: 90,
    })

    // Far enough down to have passed the stop at 90 and liquidation at 81.
    marks.set("BTC", 70)
    await loadPaperPortfolio(userId, [wallet])

    // Coming down from 100 the stop is met first, so that is what happened.
    expect(await reasons()).toEqual(["order", "stop_loss"])
  })

  it("changes nothing when it runs again", async () => {
    await openLong()
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [{ px: 120, sz: null }],
      slPx: null,
    })
    marks.set("BTC", 125)

    await loadPaperPortfolio(userId, [wallet])
    const after = await journal()
    await loadPaperPortfolio(userId, [wallet])
    await loadPaperPortfolio(userId, [wallet])

    expect(await journal()).toHaveLength(after.length)
  })

  it("cancels a waiting order it can no longer afford instead of filling it", async () => {
    // Affordable when it was placed: 4,500 of margin against 10,000 of cash.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 50,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    // Then almost all the cash goes into a position instead. A waiting order
    // holds nothing aside, so by the time it fills the money is elsewhere.
    await openLong(95, 1)

    marks.set("BTC", 89)
    const account = await loadPaperPortfolio(userId, [wallet])

    expect(account.orders).toHaveLength(0)
    // One fill only: the position. The order was cancelled, never filled.
    expect(account.positions).toHaveLength(1)
    expect(await reasons()).toEqual(["order"])
  })
})

describe("catching up on candles nobody was watching", () => {
  it("fills an order on a wick that never shows in today's price", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    // The order is stamped now, so give it a bar that opens after it.
    candles = [
      bar({
        openTime: Date.now() + MINUTE,
        open: 100,
        high: 101,
        low: 88,
        close: 100,
      }),
    ]
    await lastLookedAt(10 * MINUTE)

    const account = await loadPaperPortfolio(userId, [wallet])

    // Price is back at 100 and shows nothing, but the candle dipped to 88.
    expect(account.positions).toHaveLength(1)
    expect(account.positions[0].entryPx).toBe(90)
  })

  it("gives a candle that covered both the target and the stop to the stop", async () => {
    await openLong()
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [{ px: 120, sz: null }],
      slPx: 90,
    })

    candles = [
      bar({
        openTime: Date.now() + MINUTE,
        open: 100,
        high: 125,
        low: 85,
        close: 100,
      }),
    ]
    await lastLookedAt(10 * MINUTE)
    await loadPaperPortfolio(userId, [wallet])

    // Which came first is unknowable, so the worse story is the honest one.
    expect(await reasons()).toEqual(["order", "stop_loss"])
  })

  it("leaves a bar alone for an order that did not exist when it opened", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    // A bar that opened well before the order was placed.
    candles = [
      bar({
        openTime: Date.now() - 5 * MINUTE,
        open: 100,
        high: 100,
        low: 85,
        close: 100,
      }),
    ]
    await lastLookedAt(10 * MINUTE)

    const account = await loadPaperPortfolio(userId, [wallet])

    // Filling on price that predates the order would be an invention.
    expect(account.positions).toHaveLength(0)
    expect(account.orders).toHaveLength(1)
  })
})

describe("managing what is open", () => {
  it("moves a waiting order to a new price", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [waiting] = await orders()
    await movePaperOrder(userId, wallet, { orderId: waiting.id, px: 85 })

    const [moved] = await orders()
    expect(moved.px).toBe(85)
  })

  it("fills an order dragged through the market instead of leaving it there", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [waiting] = await orders()
    await movePaperOrder(userId, wallet, { orderId: waiting.id, px: 105 })

    expect(await orders()).toHaveLength(0)
    const held = await positions()
    expect(held).toHaveLength(1)
    expect(held[0].entryPx).toBe(100)
  })

  it("changes how much a waiting order is for, and where it gets out", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [waiting] = await orders()
    await updatePaperOrder(userId, wallet, {
      orderId: waiting.id,
      sz: 2,
      tpPx: 120,
      slPx: 85,
    })

    const [changed] = await orders()
    expect(changed.sz).toBe(2)
    expect(changed.tpPx).toBe(120)
    expect(changed.slPx).toBe(85)
    // The price is the chart's to change, never this window's.
    expect(changed.px).toBe(90)
  })

  it("refuses a size the account can no longer put up the margin for", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [waiting] = await orders()
    // 1,000 coins at 90 on 5× is 18,000 of margin against 10,000 of cash.
    await expect(
      updatePaperOrder(userId, wallet, {
        orderId: waiting.id,
        sz: 1_000,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_MARGIN")
    expect((await orders())[0].sz).toBe(1)
  })

  it("refuses a target and a stop on the wrong side of the order's price", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [waiting] = await orders()
    await expect(
      updatePaperOrder(userId, wallet, {
        orderId: waiting.id,
        sz: 1,
        tpPx: 80,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_TAKE_PROFIT_SIDE")
    await expect(
      updatePaperOrder(userId, wallet, {
        orderId: waiting.id,
        sz: 1,
        tpPx: null,
        slPx: 95,
      })
    ).rejects.toThrow("PAPER_STOP_SIDE")
  })

  it("refuses to change an order that has already gone", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [waiting] = await orders()
    // Price reaches it, so the settle inside the edit fills it first.
    marks.set("BTC", 85)
    await expect(
      updatePaperOrder(userId, wallet, {
        orderId: waiting.id,
        sz: 2,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_ORDER_NOT_FOUND")
  })

  it("cancels a waiting order", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 90,
      sz: 1,
      leverage: 5,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [waiting] = await orders()
    await cancelPaperOrder(userId, wallet.id, waiting.id)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses a stop on the wrong side of the trade", async () => {
    await openLong()
    await expect(
      setPaperBrackets(userId, wallet, {
        marketKey: BTC,
        targets: [],
        slPx: 120,
      })
    ).rejects.toThrow("PAPER_STOP_SIDE")
    await expect(
      setPaperBrackets(userId, wallet, {
        marketKey: BTC,
        targets: [{ px: 80, sz: null }],
        slPx: null,
      })
    ).rejects.toThrow("PAPER_TAKE_PROFIT_SIDE")
  })

  it("lets a long trail its stop above entry but not beyond the current price", async () => {
    await openLong()
    marks.set("BTC", 120)

    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [],
      slPx: 110,
    })
    expect((await positions())[0].slPx).toBe(110)

    await expect(
      setPaperBrackets(userId, wallet, {
        marketKey: BTC,
        targets: [],
        slPx: 121,
      })
    ).rejects.toThrow("PAPER_STOP_SIDE")
  })

  it("lets a short trail its stop below entry but not beyond the current price", async () => {
    await openShort()
    marks.set("BTC", 80)

    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [],
      slPx: 90,
    })
    expect((await positions())[0].slPx).toBe(90)

    await expect(
      setPaperBrackets(userId, wallet, {
        marketKey: BTC,
        targets: [],
        slPx: 79,
      })
    ).rejects.toThrow("PAPER_STOP_SIDE")
  })

  it("clears a target and a stop again", async () => {
    await openLong()
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [{ px: 120, sz: null }],
      slPx: 90,
    })
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      targets: [],
      slPx: null,
    })
    const [held] = await positions()
    expect(held.tpPx).toBeNull()
    expect(held.slPx).toBeNull()
  })

  it("closes a position at what it costs now", async () => {
    await openLong()
    marks.set("BTC", 110)
    await closePaperPosition(userId, wallet, BTC)

    expect(await positions()).toHaveLength(0)
    const closing = (await journal()).find((row) => row.reason === "manual")
    expect(closing?.closedPnl).toBeCloseTo(10, 10)
  })

  it("turns a position around in one go", async () => {
    await openLong()
    marks.set("BTC", 110)
    await flipPaperPosition(userId, wallet, BTC)

    const [held] = await positions()
    // Long one becomes short one, at the price it turned at.
    expect(held.szi).toBeCloseTo(-1, 10)
    expect(held.entryPx).toBe(110)
    // The old trade is banked in the same fill that opened the new one.
    const turn = (await journal()).find((row) => row.sz === 2)
    expect(turn?.closedPnl).toBeCloseTo(10, 10)
  })

  it("closes everything at once", async () => {
    await openLong()
    const { closed } = await closeAllPaperPositions(userId, [wallet])
    expect(closed).toBe(1)
    expect(await positions()).toHaveLength(0)
  })
})

describe("the Journal stamp", () => {
  it("answers 'unchanged' until a fill lands, then sends the rows", async () => {
    await openLong()
    const first = await loadPaperPortfolio(userId, [wallet])
    expect(first.journalUnchanged).toBe(false)
    expect(first.fills.length + first.trades.length).toBeGreaterThan(0)

    // Nothing has happened: the rows stay home.
    const again = await loadPaperPortfolio(userId, [wallet], {
      journalStamp: first.journalStamp,
    })
    expect(again.journalUnchanged).toBe(true)
    expect(again.fills).toEqual([])
    expect(again.trades).toEqual([])
    expect(again.journalStamp).toBe(first.journalStamp)

    // A close writes a fill, which is exactly when the Journal changes.
    marks.set("BTC", 110)
    await closePaperPosition(userId, wallet, BTC)
    const changed = await loadPaperPortfolio(userId, [wallet], {
      journalStamp: first.journalStamp,
    })
    expect(changed.journalUnchanged).toBe(false)
    expect(changed.trades).toHaveLength(1)
    expect(changed.journalStamp).not.toBe(first.journalStamp)

    const fillIds = (await journal()).map((row) => row.id)
    await hidePaperJournalEntries(userId, fillIds)
    const hidden = await loadPaperPortfolio(userId, [wallet], {
      journalStamp: changed.journalStamp,
    })
    expect(hidden.journalUnchanged).toBe(false)
    expect(hidden.fills).toEqual([])
    expect(hidden.trades).toEqual([])
    expect(hidden.journalStamp).not.toBe(changed.journalStamp)
  })
})

describe("what the account is worth", () => {
  it("adds up to the same cash the journal says", async () => {
    await openLong()
    marks.set("BTC", 110)
    await closePaperPosition(userId, wallet, BTC)

    const figures = await paperWalletFigures(userId, [wallet])
    const rows = await journal()
    const banked = rows.reduce((sum, row) => sum + row.closedPnl - row.fee, 0)

    expect(figures.get("w1")?.equity).toBeCloseTo(10_000 + banked, 8)
    expect(figures.get("w1")?.inTrades).toBe(0)
  })

  it("holds margin back while a position is open and counts its profit", async () => {
    await openLong(1, 5)
    marks.set("BTC", 110)

    const figures = await paperWalletFigures(userId, [wallet])
    const account = figures.get("w1")
    // One coin bought at 100 on 5x: 20 of margin, and 10 of profit at 110.
    expect(account?.inTrades).toBeCloseTo(20, 10)
    expect(account?.openProfit).toBeCloseTo(10, 10)
    // Up ten on the position, and being up is money the account has: free is
    // what it is worth less what is committed. 10,000 − fee − 20 margin + 10.
    expect(account?.free).toBeCloseTo(
      10_000 - 100 * TAKER_FEE_RATE - 20 + 10,
      8
    )
  })
})

describe("whose wallet it is", () => {
  it("will not touch another person's position", async () => {
    await openLong()
    const stranger = await insertUser(database, { email: "someone@else.test" })

    await expect(
      closePaperPosition(stranger.id, { ...wallet }, BTC)
    ).rejects.toThrow("PAPER_POSITION_NOT_FOUND")
    expect(await positions()).toHaveLength(1)
  })

  it("takes the whole trading history with a deleted wallet", async () => {
    await openLong()
    await database
      .delete(tradeWallets)
      .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, "w1")))

    expect(await positions()).toHaveLength(0)
    expect(await journal()).toHaveLength(0)
  })
})
