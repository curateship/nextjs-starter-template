import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DcaParams, LadderPlan } from "@/lib/trade/dca"
import type { TradeWallet } from "@/lib/trade/wallets"
import { encryptSecret } from "@/server/auth/encryption"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { defaultGridParams, type GridPlan } from "@/lib/trade/grid"
import type { WatchPlan } from "@/lib/trade/watch-order"
import {
  moveLiveGridExit,
  nothingStood,
  placeLiveDcaLadder,
  reconcileLiveLadders,
  resetRefusalHolds,
} from "@/server/trade/live-smart-orders"
import { resetWatchChaseGate } from "@/server/trade/smart-watch"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import {
  tradeLiveJournal,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

const prices = vi.fn()
const account = vi.fn()
const portfolio = vi.fn()
const fills = vi.fn()
const place = vi.fn()
const cancel = vi.fn()
const setBrackets = vi.fn()

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
        network: "testnet",
        networkLabel: "Testnet",
        rows: [
          {
            key: "hyperliquid:testnet:BTC",
            marketId: "BTC",
            symbol: "BTC",
            subExchange: null,
            category: "crypto",
            sizeDecimals: 3,
            maxLeverage: 50,
            isolatedOnly: false,
            iconUrl: null,
            price: 100,
            change24h: null,
            volume24hUsd: 0,
            fundingHourly: null,
            openInterestUsd: null,
          },
        ],
      }),
      prices,
      candles: async () => [],
      roundPx: (px: number) => px,
    },
    account: { fetch: account },
    orders: {
      portfolio,
      fills,
      place,
      cancel,
      close: vi.fn(),
      setBrackets,
    },
  }),
}))

const MARKET = "hyperliquid:testnet:BTC"
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
const KEY = "ab".repeat(32)

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet

function params(over: Partial<DcaParams> = {}): DcaParams {
  return {
    rungs: [{ deviation: 5 }, { deviation: 8 }],
    cascade: null,
    entryLimit: null,
    baseDetection: { searchBars: 36, holdBars: 8, withTrendOnly: true, minBarsApart: 20 },
    maxPositionPct: 20,
    sizeMultiplier: 2,
    compound: true,
    leverage: 1,
    maxOrderVolPct: 0,
    twoGreen: false,
    // Inert: every ladder watches its rungs now, whatever this says. Still
    // here only because the saved-settings type carries the field.
    rungEntry: "limit",
    anchor: "click",
    takeProfit: null,
    stopLoss: null,
    ...over,
  }
}


/**
 * A live watch on a level the price has already gone past, so the next pass
 * takes the market rather than resting anything.
 */
async function watchThroughTheLevel(): Promise<void> {
  const plan: WatchPlan = {
    triggerPx: 100,
    side: "buy",
    sz: 1,
    leverage: 1,
    maxLeverage: 50,
    sizeDecimals: 3,
    minOrderSize: null,
    minOrderValueUsd: null,
    priceTick: null,
    tpPx: null,
    slPx: null,
    reduceOnly: false,
    maker: false,
    heldAtStart: 0,
    chaseGiveUp: 0,
    phase: "waiting",
    sent: false,
    orderId: null,
    orderPx: null,
    missingSince: 0,
    heldWhenPlaced: 0,
    chasedAt: 0,
    chases: 0,
    startedAt: Date.now() - 10_000,
  }
  await database.insert(tradeSmartLadders).values({
    userId,
    id: "watch-1",
    walletId: "live-1",
    marketKey: MARKET,
    kind: "watch",
    status: "active",
    plan,
    createdAt: new Date(Date.now() - 10_000),
    updatedAt: new Date(Date.now() - 10_000),
  })
  portfolio.mockResolvedValue({ positions: [], orders: [] })
  // Cheaper than the level. "Get me in, I will pay up to 100" is already met.
  prices.mockResolvedValue(new Map([["BTC", 94]]))
}

/** A live watch mid-chase: its order is resting and the gates are long open. */
async function chasingWatch(): Promise<void> {
  const plan: WatchPlan = {
    triggerPx: 100,
    side: "buy",
    sz: 1,
    leverage: 1,
    maxLeverage: 50,
    sizeDecimals: 3,
    minOrderSize: null,
    minOrderValueUsd: null,
    priceTick: null,
    tpPx: null,
    slPx: null,
    reduceOnly: false,
    maker: false,
    heldAtStart: 0,
    chaseGiveUp: 0,
    phase: "taking",
    sent: true,
    orderId: "ord-old",
    orderPx: 100,
    missingSince: 0,
    heldWhenPlaced: 0,
    chasedAt: Date.now() - 60_000,
    chases: 0,
    startedAt: Date.now() - 120_000,
  }
  await database.insert(tradeSmartLadders).values({
    userId,
    id: "watch-1",
    walletId: "live-1",
    marketKey: MARKET,
    kind: "watch",
    status: "active",
    plan,
    createdAt: new Date(Date.now() - 120_000),
    updatedAt: new Date(Date.now() - 60_000),
  })
  // The order really is resting, exactly as the exchange would report it.
  portfolio.mockResolvedValue({
    positions: [],
    orders: [
      {
        orderId: "ord-old",
        marketId: "BTC",
        side: "buy",
        px: 100,
        sz: 1,
        reduceOnly: false,
    maker: false,
    heldAtStart: 0,
      },
    ],
  })
  // Price walked up, so the chase wants to re-price the resting buy.
  prices.mockResolvedValue(new Map([["BTC", 105]]))
}

async function watchPlanNow(): Promise<WatchPlan> {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.id, "watch-1"))
  expect(rows).toHaveLength(1)
  return rows[0].plan as WatchPlan
}

async function ladder(): Promise<LadderPlan> {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
  expect(rows).toHaveLength(1)
  return rows[0].plan as LadderPlan
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  resetWatchChaseGate()
  // Held per wallet and market in module state, so one test's refused buy
  // silently skipped the next test's.
  resetRefusalHolds()
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a test-only secret"
  for (const mock of [
    prices,
    account,
    portfolio,
    fills,
    place,
    cancel,
    setBrackets,
  ]) {
    mock.mockReset()
  }
  prices.mockResolvedValue(new Map([["BTC", 100]]))
  account.mockResolvedValue({
    equity: 1_000,
    free: 1_000,
    inTrades: 0,
    openProfit: 0,
  })
  portfolio.mockResolvedValue({ positions: [], orders: [] })
  fills.mockResolvedValue([])
  cancel.mockResolvedValue(undefined)
  setBrackets.mockResolvedValue(undefined)

  userId = (await insertUser(database)).id
  await database.insert(tradeWallets).values({
    userId,
    id: "live-1",
    label: "Live test",
    kind: "live",
    status: "active",
    protocol: "hyperliquid",
    network: "testnet",
    startingBalance: 1_000,
    address: ADDRESS,
    agentKeyEncrypted: encryptSecret(KEY),
  })
  wallet = {
    id: "live-1",
    label: "Live test",
    kind: "live",
    status: "active",
    protocol: "hyperliquid",
    network: "testnet",
    startingBalance: 1_000,
    address: ADDRESS,
    hasKey: true,
    keyValidUntil: null,
  }
})

afterEach(async () => {
  await client.close()
})

describe("live Smart orders", () => {
  it("sends nothing to the exchange when placing — every rung is watched", async () => {
    const result = await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })

    expect(result).toEqual({ placed: 2, passed: 0 })
    // Not one order. A resting rung ties up real margin for a buy that may
    // never happen; the engine sends the order when price reaches the rung.
    expect(place).not.toHaveBeenCalled()
    const plan = await ladder()
    expect(plan.rungs.map((rung) => rung.status)).toEqual([
      "waiting",
      "waiting",
    ])
    expect(plan.rungs.map((rung) => rung.orderId)).toEqual([null, null])
  })

  it("ignores the borrowing setting — real money only ever spends cash", async () => {
    // The setting is a backtest instrument. It reaches the rung sizing, and
    // the orders are still sent at leverage 1, so a live ladder that read it
    // would buy three times the coin and pay the whole price out of a real
    // Hyperliquid account.
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params({ leverage: 3 }),
    })

    const plan = await ladder()
    expect(plan.leverage).toBe(1)
    // The same size a cash ladder gets, to the ninth decimal.
    expect(plan.rungs[0].sz).toBeCloseTo(0.701, 9)
  })

  it("keeps fixed sizing on the wallet's starting balance", async () => {
    account.mockResolvedValue({
      equity: 1_500,
      free: 1_500,
      inTrades: 0,
      openProfit: 0,
    })

    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params({ compound: false }),
    })

    // Sized from the $1,000 the wallet started with, not the $1,500 it holds.
    expect((await ladder()).rungs[0].sz).toBeCloseTo(0.701, 9)
  })

  it("reads fills from the ladder start so a restart cannot lose an old fill", async () => {
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })
    const started = Date.now() - 2 * 60 * 60 * 1_000
    await database
      .update(tradeSmartLadders)
      .set({
        createdAt: new Date(started),
        updatedAt: new Date(Date.now() - 3_000),
      })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    expect(fills.mock.calls[0][2]).toBe(started - 60_000)
  })

  it("survives a smart order it cannot advance, and writes it down", async () => {
    // **A throw must not take the wallet with it.** Ladders, grids and
    // watches share a pass because they share one look at the exchange, and a
    // throw anywhere in that pass used to stop all of it: no triggers, no
    // rungs, no stops, and nothing said so. On 20 Aug 2026 a single watched
    // order did exactly that on two exchanges for twenty minutes, while the
    // Workers screen went on calling the engine healthy.
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })

    // Price crosses the first rung and the exchange breaks in a way nothing
    // along the way catches.
    prices.mockResolvedValue(new Map([["BTC", 94]]))
    place.mockRejectedValue(new TypeError("something broke"))
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))

    // The pass finishes rather than throwing, so every other row on this
    // wallet still gets its turn.
    await expect(reconcileLiveLadders(userId, wallet)).resolves.toBeUndefined()

    // And it is written down rather than passed over in silence, which is the
    // half that made this cost an afternoon.
    const noted = await database.select().from(tradeLiveJournal)
    expect(
      noted.some(
        (row) => row.marketKey === MARKET && row.action === "refused"
      )
    ).toBe(true)
  })

  it("voids the chase's replacement when the cancel did not cancel", async () => {
    // **The other half of the 20 Aug 2026 money bug.** The chase re-prices by
    // cancelling and re-placing, and a cancel usually fails because the order
    // already FILLED — placing the replacement then buys the same thing
    // twice. A failed cancel must void the replacement and leave the watch
    // waiting for the position that fill is about to become.
    await chasingWatch()
    cancel.mockRejectedValue(new Error("KUCOIN_100004:order cannot be cancelled"))

    await reconcileLiveLadders(userId, wallet)

    expect(place).not.toHaveBeenCalled()
    const plan = await watchPlanNow()
    expect(plan.orderId).toBeNull()
    // Still true: money may be standing on the exchange, and only a proven
    // cancel may say otherwise.
    expect(plan.sent).toBe(true)
  })

  it("still swaps the order when the cancel really cancelled", async () => {
    // The counterpart, so the guard cannot quietly freeze every chase.
    await chasingWatch()
    cancel.mockResolvedValue(undefined)
    place.mockResolvedValue({
      status: "resting",
      orderId: "ord-new",
      avgPx: null,
      filledSz: null,
    })

    await reconcileLiveLadders(userId, wallet)

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(place).toHaveBeenCalledTimes(1)
    const plan = await watchPlanNow()
    expect(plan.orderId).toBe("ord-new")
    expect(plan.sent).toBe(true)
  })

  it("keeps working the wallet when the fill feed refuses to answer", async () => {
    // **Why Phemex watches never fired, 20 Aug 2026.** That exchange refused
    // the fill feed all day with a plain 400, and the refusal took the whole
    // wallet's pass with it — so a watched level was never once compared
    // against the price. KuCoin's fill feed answered, and KuCoin's watches
    // fired all day, which is what pinned it to this read.
    //
    // Fills are the record of what already happened. A pass that misses them
    // catches up on the next one; a pass that dies trades nothing at all.
    await chasingWatch()
    fills.mockRejectedValue(
      new Error("PHEMEX_HTTP_400:/api-data/g-futures/trades")
    )
    cancel.mockResolvedValue(undefined)
    place.mockResolvedValue({
      status: "resting",
      orderId: "ord-new",
      avgPx: null,
      filledSz: null,
    })

    await reconcileLiveLadders(userId, wallet)

    // The chase ran: the level is still being worked despite the bad read.
    expect(place).toHaveBeenCalledTimes(1)
    expect((await watchPlanNow()).orderId).toBe("ord-new")
  })

  it("watches the level but spends nothing when the account will not answer", async () => {
    // The same rule where money is involved, drawn the other way: without a
    // cash figure the wallet cannot know it can afford anything, so it must
    // not buy — but that is a reason to wait a pass, not to stop watching.
    await chasingWatch()
    account.mockRejectedValue(new Error("EXCHANGE_BUSY"))
    cancel.mockResolvedValue(undefined)

    await reconcileLiveLadders(userId, wallet)

    // Nothing bought on an unknown balance, and nothing thrown either.
    expect(place).not.toHaveBeenCalled()
  })

  it("puts a rung back when the exchange definitely refused its buy", async () => {
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })

    // Price crosses the first rung; the engine fires it; the exchange
    // processes the order and refuses it outright — nothing stood.
    prices.mockResolvedValue(new Map([["BTC", 94]]))
    place.mockRejectedValue(
      new Error("LIVE_ORDER_REFUSED:order 0: Insufficient margin to place order.")
    )
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    const plan = await ladder()
    // Not recorded as bought with nothing behind it — which used to end the
    // ladder and let a flow place a fresh one into the same refusal, forever.
    expect(plan.rungs[0].status).toBe("waiting")
    expect(place).toHaveBeenCalled()
    const rows = await database.select().from(tradeSmartLadders)
    expect(rows[0].status).toBe("active")
  })

  it("puts a watched level back when its market buy was refused", async () => {
    // **The 21 Aug 2026 freeze.** A Phemex watch on NFLX was drawn above the
    // price, so the engine went to take the market; the exchange refused it;
    // and the plan was saved carrying `sent` with no order to point at.
    // Nothing but a fill or a person ever clears that flag, so the level did
    // nothing for the next seventy-seven minutes while the price sat a dollar
    // under it.
    await watchThroughTheLevel()
    place.mockRejectedValue(
      new Error("LIVE_ORDER_REFUSED:PHEMEX_11150:TE_OI_LIMIT_REDUCE_ONLY")
    )

    await reconcileLiveLadders(userId, wallet)

    expect(place).toHaveBeenCalledTimes(1)
    const plan = await watchPlanNow()
    expect(plan.sent).toBe(false)
    expect(plan.phase).toBe("waiting")
    const rows = await database.select().from(tradeSmartLadders)
    expect(rows[0].status).toBe("active")
  })

  it("puts a watched level back when Aster refuses a pre-order setting", async () => {
    await watchThroughTheLevel()
    place.mockRejectedValue(
      new Error(
        "LIVE_MARGIN_MODE:Aster could not switch BTCUSDT to isolated margin, so nothing was ordered."
      )
    )

    await reconcileLiveLadders(userId, wallet)

    const plan = await watchPlanNow()
    expect(plan.sent).toBe(false)
    expect(plan.phase).toBe("waiting")
  })

  it("puts a watched level back when Aster returns a named refusal", async () => {
    await watchThroughTheLevel()
    place.mockRejectedValue(
      new Error("ASTER_PRICE_STEP:Aster refused a price between its legal steps.")
    )

    await reconcileLiveLadders(userId, wallet)

    const plan = await watchPlanNow()
    expect(plan.sent).toBe(false)
    expect(plan.phase).toBe("waiting")
  })

  it("puts a watched level back when the exchange was too busy to look", async () => {
    // A rate limit is refused before a request is even built, so it is every
    // bit as certain as a refusal that nothing was placed. Treating it as a
    // maybe is what froze the same NFLX level a second time, eighty minutes
    // after the first.
    await watchThroughTheLevel()
    place.mockRejectedValue(new Error("EXCHANGE_BUSY"))

    await reconcileLiveLadders(userId, wallet)

    const plan = await watchPlanNow()
    expect(plan.sent).toBe(false)
    expect(plan.phase).toBe("waiting")

    // And the moment the exchange answers again, it buys — no minute's hold,
    // because the hold belongs to a refusal that would repeat.
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))
    place.mockReset()
    place.mockResolvedValue({
      status: "filled",
      orderId: "ord-1",
      avgPx: 94,
      filledSz: 1,
    })
    await reconcileLiveLadders(userId, wallet)
    expect(place).toHaveBeenCalledTimes(1)
    expect((await watchPlanNow()).sent).toBe(true)
  })

  it("keeps a watched level spent when the refusal promises nothing", async () => {
    // The counterpart, and the reason the flag exists: a timeout mid-order
    // may have filled. That one stays `sent`, because buying twice is worse
    // than waiting.
    await watchThroughTheLevel()
    place.mockRejectedValue(
      Object.assign(new Error("LIVE_ORDER_UNKNOWN"), { name: "TimeoutError" })
    )

    await reconcileLiveLadders(userId, wallet)

    const plan = await watchPlanNow()
    expect(plan.sent).toBe(true)
  })

  it("does not claim an unrelated manual fill at the same price", async () => {
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })
    const plan = await ladder()
    fills.mockResolvedValue([
      {
        fillId: "manual-fill",
        orderId: "999",
        marketId: "BTC",
        side: "buy",
        px: plan.rungs[0].px,
        sz: plan.rungs[0].sz,
        at: Date.now(),
      },
    ])
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    // A watched rung has no order for that fill to belong to. Somebody's
    // hand-placed buy at the same price is theirs, and the rung keeps waiting
    // for its own moment.
    expect((await ladder()).rungs[0].status).toBe("waiting")
  })
})

describe("dragging a live grid's stop", () => {
  /**
   * A grid from $80 to $90 on a market trading at $100, so every level is
   * waiting and nothing is held. That is a grid's ordinary state between one
   * cycle and the next, not a broken one.
   */
  async function restingGrid(): Promise<void> {
    const levels = [80, 85].map((buyPx) => ({
      buyPx,
      sellPx: buyPx + 5,
      sz: 1,
      budget: buyPx,
      heldSz: 0,
      status: "waiting" as const,
      armed: true,
      dead: false,
      cycles: 0,
    }))
    const plan: GridPlan = {
      topPx: 90,
      bottomPx: 80,
      takeProfitPx: null,
      spacing: "even",
      sizing: "even",
      potPct: 20,
      maxOrderVolPct: 0,
      startedAt: Date.now() - 60_000,
      sizeDecimals: 3,
      priceTick: null,
      maxLeverage: 50,
      levels,
      stopLoss: { mode: "percent", underPct: 5, px: null, base: null },
      baseDetection: defaultGridParams().baseDetection,
      baseWatch: null,
      aimedSlPx: null,
      seenFillsTo: 0,
      cycles: 0,
      follow: false,
      shifts: 0,
      closedReason: null,
    }
    await database.insert(tradeSmartLadders).values({
      userId,
      id: "grid-1",
      walletId: "live-1",
      marketKey: MARKET,
      kind: "grid",
      status: "active",
      plan,
      createdAt: new Date(Date.now() - 120_000),
      updatedAt: new Date(Date.now() - 60_000),
    })
  }

  async function gridPlan(): Promise<GridPlan> {
    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.id, "grid-1"))
    expect(rows).toHaveLength(1)
    return rows[0].plan as GridPlan
  }

  it("saves a stop dragged while the grid holds nothing", async () => {
    // The exchange has no position, because the grid has not bought yet. This
    // used to throw LIVE_POSITION_GONE, which threw the drag away with it: the
    // stop the hand had just moved was never saved, and the Journal gained a
    // "refused" row for something nobody had done wrong.
    await restingGrid()
    portfolio.mockResolvedValue({ positions: [], orders: [] })

    await expect(
      moveLiveGridExit(userId, wallet, {
        gridId: "grid-1",
        which: "stopLoss",
        px: 70,
      })
    ).resolves.toEqual({ moved: true })

    const plan = await gridPlan()
    expect(plan.stopLoss).toMatchObject({ mode: "fixed", px: 70 })
    // Nothing was written to the exchange, so nothing is remembered as written.
    // Claiming otherwise would make the next pass read a stop it never wrote as
    // one a hand had moved, and leave it alone for good.
    expect(plan.aimedSlPx).toBeNull()
    expect(setBrackets).not.toHaveBeenCalled()
  })

  it("still writes the stop to the exchange when coins are held", async () => {
    await restingGrid()
    portfolio.mockResolvedValue({
      positions: [{ marketId: "BTC", szi: 1, entryPx: 85, leverage: 1 }],
      orders: [],
    })

    await moveLiveGridExit(userId, wallet, {
      gridId: "grid-1",
      which: "stopLoss",
      px: 70,
    })

    expect(setBrackets).toHaveBeenCalled()
    expect(await gridPlan()).toMatchObject({ aimedSlPx: 70 })
  })
})

describe("which refusals promise nothing stood", () => {
  it("trusts the post-only refusal even when it arrives out of a modify", () => {
    expect(
      nothingStood(
        new Error(
          "LIVE_EXCHANGE:Error placing new order during modify: Post only order would have immediately matched, bbo was 2440.1@2440.2"
        )
      )
    ).toBe(true)
  })

  it("still trusts it from a plain place", () => {
    expect(
      nothingStood(
        new Error(
          "LIVE_ORDER_REFUSED:Post only order would have immediately matched, bbo was 84.1@84.2"
        )
      )
    ).toBe(true)
  })

  it("keeps not trusting an ambiguous transport failure", () => {
    expect(nothingStood(new Error("LIVE_EXCHANGE:fetch failed"))).toBe(false)
  })
})
