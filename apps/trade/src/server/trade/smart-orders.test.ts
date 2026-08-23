import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { DcaParams, LadderPlan } from "@/lib/trade/dca"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { customShellAutomations } from "@/server/schema"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { mayOpenCoin } from "@/server/trade/smart-ladders"
import {
  loadPaperPortfolio,
  placePaperOrder,
  setPaperBrackets,
} from "@/server/trade/paper"
import { loadSmartDca, saveSmartDca } from "@/server/trade/prefs"
import {
  cancelLadderRest,
  cancelLadderRung,
  cancelWatchOrder,
  listActiveSmartOrders,
  placeDcaLadder,
  placeWatchOrder,
  saveLadderPlan,
  updateLadderExits,
} from "@/server/trade/smart-orders"
import {
  tradePaperJournal,
  tradeFlowRunOrders,
  tradePaperOrders,
  tradePaperPositions,
  tradePrefs,
  tradeSmartLadders,
  tradeFlowRuns,
  tradeWallets,
} from "@/server/trade/schema"

// The exchange is a mock, the same way the engine's own tests mock it: a
// catalogue of rules, today's prices, and whatever candles a case scripts.
const marks = new Map<string, number>([["BTC", 100]])
let candles: CandleBar[] = []
let minOrderValueUsd: number | null = null
let minOrderSize: number | null = null

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
            priceTick: null,
            minOrderValueUsd,
            minOrderSize,
            marginModes: [],
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
const HOUR4 = 14_400_000

/**
 * A tape whose last confirmed base is `level`.
 *
 * Fifty-something 4h candles, because that is what the rule costs: the low has
 * to be the lowest of the 36 before it and then stand for 8 more.
 *
 * `endsAgoMs` is how long ago the newest candle closed, and it matters. The
 * engine only asks for this feed once a 4h bar could have closed since the
 * last look, so a tape that ends a minute ago is one the next settle will not
 * re-read — right in a real market and useless in a test that settles twice in
 * a row.
 *
 * `closes` replaces the closing prices of the newest candles, which is how the
 * buy-back tests script price climbing back over a level.
 */
function tapeWithBase(
  level: number,
  over: { closes?: number[]; endsAgoMs?: number } = {}
): CandleBar[] {
  const lows = [
    ...Array.from({ length: 41 }, () => level * 2),
    level,
    ...Array.from({ length: 18 }, () => level * 1.1),
  ]
  const tail = over.closes ?? []
  const first = lows.length - tail.length
  const start =
    Date.now() - (over.endsAgoMs ?? 5 * 3_600_000) - lows.length * HOUR4
  return lows.map((low, index) => {
    const close = index >= first ? tail[index - first] : low * 1.1
    return {
      openTime: start + index * HOUR4,
      open: close,
      high: Math.max(close, low * 1.2),
      low,
      close,
      volume: 1,
    }
  })
}

let client: PGlite
let database: CustomShellDb
let userId: string
let workspace: Awaited<ReturnType<typeof insertWorkspace>>
let wallet: TradeWallet

/** Two rungs from a $100 click: buys at 95 and 87.4, sized 1:2 from 20%. */
function params(over: Partial<DcaParams> = {}): DcaParams {
  return {
    rungs: [{ deviation: 5 }, { deviation: 8 }],
    cascade: null,
    entryLimit: null,
    baseDetection: {
      searchBars: 36,
      holdBars: 8,
      withTrendOnly: true,
      minBarsApart: 20,
    },
    maxPositionPct: 20,
    sizeMultiplier: 2,
    compound: true,
    leverage: 1,
    maxOrderVolPct: 0,
    twoGreen: false,
    // Inert: every ladder watches its rungs now, whatever this says. Still
    // here only because the saved-settings type carries the field.
    rungEntry: "limit",
    anchor: "base",
    takeProfit: null,
    stopLoss: null,
    ...over,
  }
}

async function place(over: Partial<DcaParams> = {}, clickPx = 110) {
  return await placeDcaLadder(userId, wallet, {
    marketKey: BTC,
    clickPx,
    interval: "1m",
    params: params(over),
  })
}

/** Settles everything — the read every poll makes. */
async function settle() {
  await loadPaperPortfolio(userId, [wallet])
}

async function orders() {
  return await database
    .select()
    .from(tradePaperOrders)
    .where(eq(tradePaperOrders.userId, userId))
}

async function positions() {
  return await database
    .select()
    .from(tradePaperPositions)
    .where(eq(tradePaperPositions.userId, userId))
}

async function journal() {
  return await database
    .select()
    .from(tradePaperJournal)
    .where(eq(tradePaperJournal.userId, userId))
}

async function ladderRows() {
  return await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
}

async function onlyLadder() {
  const rows = await ladderRows()
  expect(rows).toHaveLength(1)
  return { ...rows[0], plan: rows[0].plan as LadderPlan }
}

/**
 * Moves the newest ladder ten minutes into the past.
 *
 * Every rung is a price the engine watches on CLOSED candles, and a candle
 * needs a minute to close — so a ladder placed "now" cannot buy anything in a
 * test without literally waiting one out. Backdating the watch's start is the
 * same trick the two-green case has always used, applied to every fill here.
 */
async function backdate() {
  const rows = await ladderRows()
  const row = rows[rows.length - 1]
  const plan = {
    ...(row.plan as LadderPlan),
    startedAt: Date.now() - 10 * MINUTE,
  }
  await database
    .update(tradeSmartLadders)
    .set({ createdAt: new Date(plan.startedAt), plan })
    .where(eq(tradeSmartLadders.id, row.id))
}

/** Scripted candles walk forward one slot per bar inside that window. */
let dipSlot = 9

/**
 * Price dips to `px` on a closed one-minute candle and stays there.
 *
 * This is how a rung buys now: nothing rests, so a fill is a bar whose low
 * reaches the rung, read on the next settle. The mark moves with it so the
 * stops and targets downstream see the same price the old resting fills saw.
 */
async function dipTo(px: number, open = 110) {
  marks.set("BTC", px)
  candles.push({
    openTime: Date.now() - dipSlot * MINUTE,
    open,
    high: open,
    low: px,
    close: px,
    volume: 1,
  })
  dipSlot -= 1
  await settle()
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  marks.set("BTC", 100)
  minOrderValueUsd = null
  minOrderSize = null
  dipSlot = 9
  // A ladder hangs from the confirmed base, so every test needs one. 100 is
  // the base throughout unless a test swaps the tape, which keeps the rungs
  // at the 95 and 87.4 the rest of this file is written around.
  candles = tapeWithBase(100)

  userId = (await insertUser(database)).id
  workspace = await insertWorkspace(database)
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

describe("a watched order's market minimum", () => {
  it("refuses a size below one exchange step before saving the watch", async () => {
    minOrderValueUsd = 5
    minOrderSize = 0.001

    await expect(
      placeWatchOrder(userId, wallet, {
        marketKey: BTC,
        side: "buy",
        px: 77_000,
        sz: 10 / 77_000,
        leverage: 1,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("PAPER_SIZE")

    expect(await listActiveSmartOrders(userId, [wallet.id])).toEqual([])
  })

  it("freezes the accepted size and both exchange floors in the watch", async () => {
    minOrderValueUsd = 5
    minOrderSize = 0.001

    await placeWatchOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 77_000,
      sz: 80 / 77_000,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    const [watch] = await listActiveSmartOrders(userId, [wallet.id])
    expect(watch.kind).toBe("watch")
    if (watch.kind !== "watch") throw new Error("expected watch")
    expect(watch.plan.sz).toBe(0.001)
    expect(watch.plan.minOrderSize).toBe(0.001)
    expect(watch.plan.minOrderValueUsd).toBe(5)
  })
})

describe("cancelling a watched order", () => {
  it("stays cancelled when an engine pass saves an older copy afterwards", async () => {
    await placeWatchOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 95,
      sz: 1,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [watch] = await listActiveSmartOrders(userId, [wallet.id])
    if (!watch || watch.kind !== "watch") throw new Error("expected watch")

    await cancelWatchOrder(userId, wallet.id, watch.id)
    await saveLadderPlan(userId, watch.id, watch.plan, "active")

    expect(await listActiveSmartOrders(userId, [wallet.id])).toEqual([])
    const [stored] = await ladderRows()
    expect(stored.status).toBe("done")
  })

  it("accepts a repeated cancel after a stale screen shows the row again", async () => {
    await placeWatchOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 95,
      sz: 1,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })
    const [watch] = await listActiveSmartOrders(userId, [wallet.id])
    if (!watch || watch.kind !== "watch") throw new Error("expected watch")

    await expect(
      cancelWatchOrder(userId, wallet.id, watch.id)
    ).resolves.toEqual({ cancelled: true })
    await expect(
      cancelWatchOrder(userId, wallet.id, watch.id)
    ).resolves.toEqual({ cancelled: true })
  })
})

describe("who placed a smart order", () => {
  it("credits the flow only for coins its own record says it placed", async () => {
    // The flow's coin list is what it WATCHES. A ladder somebody placed by
    // hand on one of those coins is theirs — the flow finds the coin taken and
    // skips it — and reading the list instead of the record would hide their
    // own order from every screen that draws it.
    await place()
    const ladder = await onlyLadder()

    await database.insert(customShellAutomations).values({
      id: "flow-1",
      userId,
      workspaceId: workspace.id,
      name: "A flow",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await database.insert(tradeFlowRuns).values({
      userId,
      id: "run-1",
      walletId: wallet.id,
      automationId: "flow-1",
      status: "running",
      spec: {
        protocol: "hyperliquid",
        network: "mainnet",
        marketKeys: [BTC],
        strategy: { kind: "dca", params: params(), interval: "1m" },
        capUsd: 500,
        walletLabel: wallet.label,
        real: false,
      },
      // Watching BTC, but it never placed on it.
      placed: [],
      startedAt: new Date(ladder.createdAt.getTime() - 60_000),
    })

    const watched = await listActiveSmartOrders(userId, [wallet.id])
    expect(watched[0].flowRunId).toBeNull()

    // Once the flow records having placed it, it is the flow's.
    await database
      .update(tradeFlowRuns)
      .set({ placed: [BTC] })
      .where(eq(tradeFlowRuns.id, "run-1"))
    const claimed = await listActiveSmartOrders(userId, [wallet.id])
    expect(claimed[0].flowRunId).toBe("run-1")
  })

  it("never credits a run with an order older than itself", async () => {
    await place()
    const ladder = await onlyLadder()
    await database.insert(customShellAutomations).values({
      id: "flow-2",
      userId,
      workspaceId: workspace.id,
      name: "A later flow",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      compiledConfig: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await database.insert(tradeFlowRuns).values({
      userId,
      id: "run-2",
      walletId: wallet.id,
      automationId: "flow-2",
      status: "running",
      spec: {
        protocol: "hyperliquid",
        network: "mainnet",
        marketKeys: [BTC],
        strategy: { kind: "dca", params: params(), interval: "1m" },
        capUsd: 500,
        walletLabel: wallet.label,
        real: false,
      },
      placed: [BTC],
      // Switched on after the ladder already existed.
      startedAt: new Date(ladder.createdAt.getTime() + 60_000),
    })

    const orders = await listActiveSmartOrders(userId, [wallet.id])
    expect(orders[0].flowRunId).toBeNull()
  })
})

describe("placing a ladder", () => {
  it("rests nothing — every rung waits as a watched price, sized by the ramp", async () => {
    const placed = await place()
    expect(placed).toEqual({ placed: 2, passed: 0 })

    // Nothing on the book. A resting rung ties up the money for a buy that
    // may never happen, eats the order cap, and draws its level twice.
    expect(await orders()).toHaveLength(0)

    const ladder = await onlyLadder()
    expect(ladder.status).toBe("active")
    const rungs = ladder.plan.rungs
    expect(rungs.map((rung) => rung.status)).toEqual(["waiting", "waiting"])
    expect(rungs.map((rung) => rung.orderId)).toEqual([null, null])
    expect(rungs[0].px).toBe(95)
    expect(rungs[0].sz).toBeCloseTo(7.017, 9)
    expect(rungs[1].px).toBeCloseTo(87.4, 9)
    expect(rungs[1].sz).toBeCloseTo(15.255, 9)
  })

  it("stamps the flow that placed it, and leaves a hand-placed one blank", async () => {
    // The whole of how a run's dashboard tells its own trades from the ones
    // somebody put on the same wallet themselves. Without the stamp there is
    // nothing to tell them apart by afterwards.
    await placeDcaLadder(userId, wallet, {
      marketKey: BTC,
      clickPx: 110,
      interval: "1m",
      params: params(),
      flowRunId: "run-1",
    })
    expect((await onlyLadder()).flowRunId).toBe("run-1")

    await database.delete(tradeSmartLadders)
    await place()
    expect((await onlyLadder()).flowRunId).toBeNull()
  })

  it("ignores the borrowing setting outright — a wallet only ever spends cash", async () => {
    // The setting exists so a BACKTEST can measure borrowing. It reaches the
    // rung sizing, and the orders are still sent at leverage 1 — so a wallet
    // that read it would buy three times the coin and pay the whole price in
    // cash. Practice money here, real money on the live path, same rule.
    const cash = await place()
    const asked = await (async () => {
      await database.delete(tradeSmartLadders)
      return await place({ leverage: 3 })
    })()

    expect(asked).toEqual(cash)
    const ladder = await onlyLadder()
    expect(ladder.plan.leverage).toBe(1)
    expect(ladder.plan.rungs[0].sz).toBeCloseTo(7.017, 9)
    expect(ladder.plan.rungs[1].sz).toBeCloseTo(15.255, 9)
  })

  it("keeps fixed sizing on the wallet's starting balance after a profit", async () => {
    await database.insert(tradePaperJournal).values({
      userId,
      id: "earlier-profit",
      walletId: wallet.id,
      marketKey: BTC,
      side: "sell",
      px: 100,
      sz: 1,
      fee: 0,
      closedPnl: 1_000,
      reason: "manual",
    })

    await place({ compound: false })

    expect((await onlyLadder()).plan.rungs[0].sz).toBeCloseTo(7.017, 9)
  })

  it("hangs the ladder from the confirmed base, never from a clicked price", async () => {
    // The tape's base is 100, so rung 1 is a full step below it at 95 and each
    // rung after steps down from the one above. Nothing about where the chart
    // was clicked reaches this.
    expect(await place()).toEqual({ placed: 2, passed: 0 })

    const ladder = await onlyLadder()
    expect(ladder.plan.rungs[0].px).toBe(95)
    expect(ladder.plan.rungs[1].px).toBeCloseTo(87.4, 9)
    expect(ladder.plan.anchorPx).toBe(100)
  })

  it("refuses a market with no confirmed base, writing nothing", async () => {
    candles = []
    await expect(place()).rejects.toThrow("SMART_LADDER_NO_BASE")
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("still starts when price has slipped under the base", async () => {
    // The rungs are 5% and 12.6% under a base of 100 — 95 and 87.40 — so at 99
    // the whole ladder is still below the market and buys nothing today.
    // Refusing this threw away coins for no gain: it was the base being a few
    // percent above, not the ladder being in a bad place.
    marks.set("BTC", 99)
    expect(await place()).toEqual({ placed: 2, passed: 0 })
    expect(await ladderRows()).toHaveLength(1)
  })

  it("refuses a two-green ladder once price is under every rung", async () => {
    // Two-green marks nothing as skipped, so the ordinary above-market check
    // cannot catch this. Without its own check the ladder buys all of its
    // rungs at one price the moment two green candles print.
    marks.set("BTC", 80)
    await expect(place({ twoGreen: true })).rejects.toThrow(
      "SMART_LADDER_ABOVE_MARKET"
    )
    expect(await ladderRows()).toHaveLength(0)
  })

  it("still places a two-green ladder while price is above its rungs", async () => {
    marks.set("BTC", 99)
    expect(await place({ twoGreen: true })).toEqual({ placed: 2, passed: 0 })
  })

  it("refuses when the fall has taken price under every rung", async () => {
    // This is what the under-base rule was really about, asked of the prices
    // being bought at instead of the level they were measured from: at 80
    // both rungs are above the market, so the ladder would buy instantly into
    // a fall.
    marks.set("BTC", 80)
    await expect(place()).rejects.toThrow("SMART_LADDER_ABOVE_MARKET")
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("stops buying rungs once the wallet is worth less than its margin", async () => {
    // The engine's own version of the same rule, driven through a real settle:
    // a ladder that has bought and is now well down must not go on filling
    // deeper rungs on cash the account no longer has.
    await place()
    await backdate()
    await dipTo(95)
    const bought = (await positions())[0]
    expect(bought).toBeDefined()

    // The coin collapses. Cash has not moved — nothing closed — so the old
    // rule still saw the whole wallet as spendable.
    marks.set("BTC", 20)
    await settle()

    const held = (await positions())[0]
    // Whatever happened to the position, nothing may have been bought with
    // money the wallet no longer had: the margin behind it cannot be more
    // than the account is worth.
    if (held) {
      const margin = (Math.abs(held.szi) * held.entryPx) / held.leverage
      const worth = 10_000 + (20 - held.entryPx) * held.szi
      expect(margin).toBeLessThanOrEqual(worth + 1e-6)
    }
  })

  it("refuses a ladder that costs more than the free cash, writing nothing", async () => {
    // Half the account is already margin behind a position.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 50,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    await expect(place({ maxPositionPct: 100 })).rejects.toThrow(
      "SMART_LADDER_COST"
    )
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses a rung too small to be an order, naming it, writing nothing", async () => {
    await expect(place({ maxPositionPct: 0.001 })).rejects.toThrow(
      "SMART_RUNG_TOO_SMALL:1"
    )
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses the whole ladder when its split falls under the dollar floor", async () => {
    minOrderValueUsd = 1_100
    clearMarketRulesCache()
    await expect(place({ sizeMultiplier: 1 })).rejects.toThrow(
      /SMART_RUNG_DOLLAR_FLOOR:1100:.*:1:2/
    )
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses a second live ladder on the same market", async () => {
    await place()
    await expect(place()).rejects.toThrow("SMART_LADDER_EXISTS")
    expect(await ladderRows()).toHaveLength(1)
  })

  it("ignores the wallet's order cap, because placing rests nothing", async () => {
    await database.insert(tradePaperOrders).values(
      Array.from({ length: 49 }, (_, index) => ({
        userId,
        id: `stuffing-${index}`,
        walletId: wallet.id,
        marketKey: BTC,
        side: "buy" as const,
        px: 10,
        sz: 1,
        leverage: 1,
        maxLeverage: 50,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      }))
    )
    // A resting ladder was refused here. A watching one adds no orders, so a
    // full book is not its problem.
    expect(await place()).toEqual({ placed: 2, passed: 0 })
    expect(await ladderRows()).toHaveLength(1)
  })
})

describe("the ladder at work", () => {
  it("rests each bought rung's sell at the rung above, and ends when all sold", async () => {
    await place({ takeProfit: { mode: "prevRung", pct: 2 } })
    await backdate()

    await dipTo(95)

    let ladder = await onlyLadder()
    expect(ladder.plan.rungs[0].status).toBe("filled")
    expect(ladder.plan.rungs[0].sellOrderId).not.toBeNull()
    expect(ladder.plan.rungs[1].status).toBe("waiting")

    const sells = (await orders()).filter((row) => row.side === "sell")
    expect(sells).toHaveLength(1)
    // The first rung's sell rests at the click itself.
    expect(sells[0]).toMatchObject({ px: 100, reduceOnly: true })
    expect(sells[0].sz).toBeCloseTo(7.017, 9)

    // Price returns: the sell fills, the position is flat, the ladder is over
    // and the deeper rung is cancelled rather than left to re-buy.
    marks.set("BTC", 100)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.status).toBe("done")
    expect(ladder.plan.rungs[1].status).toBe("cancelled")
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
  })

  it("keeps the flow's stamp on every order the ladder sends afterwards", async () => {
    // The sell a bought rung rests is as much the flow's as the buy was, and
    // its id is written down the moment it is placed — the plan lets go of it
    // as soon as it fills, and a practice fill arrives carrying nothing else.
    await placeDcaLadder(userId, wallet, {
      marketKey: BTC,
      clickPx: 110,
      interval: "1m",
      params: params({ takeProfit: { mode: "prevRung", pct: 2 } }),
      flowRunId: "run-1",
    })
    await backdate()
    await dipTo(95)

    const sells = (await orders()).filter((row) => row.side === "sell")
    expect(sells).toHaveLength(1)

    const ledger = await database
      .select()
      .from(tradeFlowRunOrders)
      .where(eq(tradeFlowRunOrders.userId, userId))
    expect(ledger.map((row) => row.orderId)).toContain(sells[0].id)
    expect(ledger.every((row) => row.flowRunId === "run-1")).toBe(true)
  })

  it("slides the sell-everything target down as deeper rungs fill", async () => {
    await place({ takeProfit: { mode: "nearestRung", pct: 2 } })
    await backdate()

    await dipTo(95)
    expect((await positions())[0].tpPx).toBeCloseTo(100, 9)

    await dipTo(87.4)
    expect((await positions())[0].tpPx).toBeCloseTo(95, 9)
  })

  it("re-aims the average-price target after every fill", async () => {
    await place({ takeProfit: { mode: "average", pct: 2 } })
    await backdate()

    await dipTo(95)
    let held = (await positions())[0]
    expect(held.tpPx).toBeCloseTo(95 * 1.02, 9)

    await dipTo(87.4)
    held = (await positions())[0]
    expect(held.tpPx).toBeCloseTo(held.entryPx * 1.02, 9)
  })

  it("keeps the stop under the average, kills rungs beneath it, and ends the ladder when it fires", async () => {
    await place({ stopLoss: { pct: 1, base: null } })
    await backdate()

    await dipTo(95)

    const held = (await positions())[0]
    // One buy at 95, so the average is 95 and the stop 1% under it.
    expect(held.slPx).toBeCloseTo(95 * 0.99, 9)

    // The deeper rung sits below the stop: alive in the plan, off the book.
    let ladder = await onlyLadder()
    expect(ladder.plan.rungs[1].dead).toBe(true)
    expect(ladder.plan.rungs[1].status).toBe("waiting")
    expect(await orders()).toHaveLength(0)

    // The stop fires — everything sells, the dead rung never buys.
    marks.set("BTC", 93)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.status).toBe("done")
    expect(ladder.plan.rungs[1].status).toBe("cancelled")
    expect(await positions()).toHaveLength(0)
    const reasons = (await journal()).map((row) => row.reason)
    expect(reasons).toContain("stop_loss")
  })

  it("wakes the rungs under a stop that was cleared by hand", async () => {
    await place({ stopLoss: { pct: 1, base: null } })
    await backdate()
    await dipTo(95)
    expect((await onlyLadder()).plan.rungs[1].dead).toBe(true)

    // Clearing the stop by hand: the ladder stops following, the rung wakes.
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      tpPx: null,
      slPx: null,
    })
    await settle()

    const ladder = await onlyLadder()
    expect(ladder.plan.stopLoss?.mode).toBe("fixed")
    expect(ladder.plan.rungs[1].dead).toBe(false)

    // Awake means it buys when price actually gets there — no order rests.
    expect(await orders()).toHaveLength(0)
    await dipTo(87.4)
    expect((await onlyLadder()).plan.rungs[1].status).toBe("filled")
  })

  it("watches its candles in two-green mode and buys on the second green close", async () => {
    await place({ twoGreen: true })
    expect(await orders()).toHaveLength(0)

    // The ladder was placed ten minutes ago; three one-minute candles have
    // closed since — a red dip that reaches the first rung, then two greens.
    await backdate()
    const base = Date.now() - 4 * MINUTE
    candles = [
      {
        openTime: base,
        open: 96,
        high: 96,
        low: 94.9,
        close: 94.95,
        volume: 1,
      },
      {
        openTime: base + MINUTE,
        open: 94.95,
        high: 95.5,
        low: 94.9,
        close: 95.5,
        volume: 1,
      },
      {
        openTime: base + 2 * MINUTE,
        open: 95.5,
        high: 96,
        low: 95.4,
        close: 96,
        volume: 1,
      },
    ]
    await settle()

    const held = await positions()
    expect(held).toHaveLength(1)
    // Bought at the confirming candle's close, not at the rung's line — and
    // sized so the rung spends its DOLLARS at that price rather than carrying
    // a coin count fixed at a price it never filled at. The rung's budget is
    // 95 × 7.017 = $666.62, and $666.62 at 96 is 6.943 coins.
    expect(held[0].entryPx).toBeCloseTo(96, 9)
    expect(held[0].szi).toBeCloseTo(6.943, 3)
    expect(held[0].szi * held[0].entryPx).toBeCloseTo(95 * 7.017, 0)
    const ladder = await onlyLadder()
    expect(ladder.plan.rungs[0].status).toBe("filled")
    expect(ladder.plan.rungs[1].status).toBe("waiting")
    expect(await orders()).toHaveLength(0)

    // Settling again changes nothing — the candles were already read.
    await settle()
    expect(await journal()).toHaveLength(1)
  })

  it("keeps a rung it cannot afford waiting, and never shrinks the ask", async () => {
    await place()
    await backdate()

    // The cash goes somewhere else: a manual position takes nearly all of it,
    // so when price reaches the first rung there is no margin left for it.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 95,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    await dipTo(95)

    const ladder = await onlyLadder()
    // Not bought small, and not written off: the rung stays waiting, and the
    // next dip after cash frees up is still its dip.
    expect(ladder.plan.rungs[0].status).toBe("waiting")
    expect(ladder.status).toBe("active")
    // Nothing was bought for it — the ladder never shrank the ask.
    expect(
      (await journal()).filter((row) => row.side === "buy" && row.px === 95)
    ).toHaveLength(0)
  })

  it("calls off one rung, then the rest, and the empty ladder finishes", async () => {
    await place()
    const ladder = await onlyLadder()

    await cancelLadderRung(userId, wallet, {
      ladderId: ladder.id,
      rungIndex: 0,
    })
    let after = await onlyLadder()
    expect(after.plan.rungs[0].status).toBe("cancelled")
    expect(after.status).toBe("active")
    expect(await orders()).toHaveLength(0)

    await cancelLadderRest(userId, wallet, { ladderId: ladder.id })
    after = await onlyLadder()
    expect(after.status).toBe("done")
    expect(await orders()).toHaveLength(0)
  })

  it("rewrites the brackets and the sells when the exits change mid-flight", async () => {
    await place({ takeProfit: { mode: "average", pct: 2 } })
    await backdate()
    await dipTo(95)
    expect((await positions())[0].tpPx).toBeCloseTo(96.9, 9)

    const ladder = await onlyLadder()
    await updateLadderExits(userId, wallet, {
      ladderId: ladder.id,
      takeProfit: { mode: "prevRung", pct: 2 },
      stopLoss: null,
    })

    expect((await positions())[0].tpPx).toBeNull()
    const sells = (await orders()).filter((row) => row.side === "sell")
    expect(sells).toHaveLength(1)
    expect(sells[0].px).toBeCloseTo(100, 9)
    expect((await onlyLadder()).plan.takeProfit?.mode).toBe("prevRung")
  })
})

describe("everything around a ladder", () => {
  it("keeps ladders to their own account", async () => {
    await place()
    const stranger = (await insertUser(database)).id
    expect(await listActiveSmartOrders(stranger, [wallet.id])).toHaveLength(0)
    expect(await listActiveSmartOrders(userId, [wallet.id])).toHaveLength(1)
  })

  it("deleting the wallet takes its ladders with it", async () => {
    await place()
    await database.delete(tradeWallets).where(eq(tradeWallets.userId, userId))
    expect(await ladderRows()).toHaveLength(0)
  })

  it("remembers the window's settings, and junk falls back to nothing", async () => {
    expect(await loadSmartDca(userId)).toBeNull()

    const saved = params({ maxPositionPct: 33 })
    await saveSmartDca(userId, saved)
    expect(await loadSmartDca(userId)).toEqual(saved)

    await database
      .update(tradePrefs)
      .set({ smartDca: { anything: true } as never })
      .where(eq(tradePrefs.userId, userId))
    expect(await loadSmartDca(userId)).toBeNull()
  })
})

// ----- The stop that rests under the base ---------------------------------

/** The base stop as the winning setup has it: on the level, buy back after a day. */
function baseStop(over: Partial<NonNullable<DcaParams["stopLoss"]>> = {}) {
  return {
    pct: 100,
    base: { underPct: 0, reclaimDays: 1 },
    ...over,
  }
}

describe("a stop that rests under the base", () => {
  it("leaves no stop at all until a base confirms below what is held", async () => {
    await place({ stopLoss: baseStop() })
    await backdate()

    await dipTo(95)

    // The base in force is 100 — above the buy at 95, so it is a place to take
    // profit rather than one to give up. That leaves the percent, and 100%
    // below the entry is a stop price would have to reach zero to hit. So
    // there is no stop, rather than one resting at zero under every rung.
    expect((await positions())[0].slPx).toBeNull()
  })

  it("rests on the base itself, not on a percent from the entry", async () => {
    await place({ stopLoss: baseStop() })
    await backdate()
    await dipTo(95)

    // Bought off the 100 base, then a lower one confirms — which is what a
    // stop can actually rest under. The other order re-anchors the still
    // waiting rungs to the new base first, and the dip never reaches them.
    candles = tapeWithBase(90)
    await settle()

    expect((await positions())[0].slPx).toBeCloseTo(90, 9)
    expect((await onlyLadder()).plan.baseWatch?.levelPx).toBeCloseTo(90, 9)
  })

  it("rests the chosen percent under the base", async () => {
    await place({
      stopLoss: baseStop({ base: { underPct: 2, reclaimDays: 0 } }),
    })
    await backdate()
    await dipTo(95)
    // Bought off the 100 base, then the lower one confirms.
    candles = tapeWithBase(90)
    await settle()

    // 2% under a base of 90 is 88.20 — worked out from the level, never from
    // the entry, which is the mistake that put the old app's stop above it.
    expect((await positions())[0].slPx).toBeCloseTo(88.2, 9)
  })

  it("steps the ladder down instead of ending it, and the next rung still buys", async () => {
    await place({ stopLoss: baseStop() })
    await backdate()
    await dipTo(95)
    // Bought off the 100 base, then the lower one confirms under the buy.
    candles = tapeWithBase(90)
    await settle()
    let ladder = await onlyLadder()
    // The deeper rung sits under the stop, so it is asleep for now.
    expect(ladder.plan.rungs[1].dead).toBe(true)
    expect(await orders()).toHaveLength(0)

    // Through the base: the stop takes the rung.
    marks.set("BTC", 89)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.status).toBe("active")
    expect(ladder.plan.steppedDown).toBe(1)
    expect(ladder.plan.rungs[0].status).toBe("sold")
    expect(ladder.plan.rungs[1].status).toBe("waiting")
    expect(ladder.plan.rungs[1].dead).toBe(false)
    expect(await positions()).toHaveLength(0)
    expect((await journal()).map((row) => row.reason)).toContain("stop_loss")

    // The next rung waits at its own price, and price reaching it buys it.
    expect(await orders()).toHaveLength(0)
    await dipTo(87.4)
    expect((await onlyLadder()).plan.rungs[1].status).toBe("filled")
  })

  it("is over for good once the last rung is stopped out, and arms no buy-back", async () => {
    await placeDcaLadder(userId, wallet, {
      marketKey: BTC,
      clickPx: 110,
      interval: "1m",
      params: params({ rungs: [{ deviation: 5 }], stopLoss: baseStop() }),
    })
    await backdate()
    await dipTo(95)
    candles = tapeWithBase(90)
    await settle()

    marks.set("BTC", 89)
    await settle()

    const ladder = await onlyLadder()
    expect(ladder.status).toBe("done")
    expect(ladder.plan.reclaim).toBeNull()
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
  })

  it("puts the rung back when price reclaims the level, for the money it was allowed", async () => {
    await place({ stopLoss: baseStop() })
    await backdate()
    await dipTo(95)
    // Bought off the 100 base, then the lower one confirms under the buy.
    candles = tapeWithBase(90, { endsAgoMs: 48 * 3_600_000 })
    await settle()

    const budget = (await onlyLadder()).plan.rungs[0].budget
    marks.set("BTC", 89)
    await settle()

    let ladder = await onlyLadder()
    expect(ladder.plan.reclaim).toMatchObject({
      rungIndex: 0,
      aboveSince: null,
    })

    // Ten fresh 4h candles closing above where the stop cut — comfortably past
    // the one day the buy-back waits for.
    candles = tapeWithBase(90, { closes: Array.from({ length: 10 }, () => 96) })
    marks.set("BTC", 96)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.plan.reclaim).toBeNull()
    expect(ladder.plan.rungs[0].status).toBe("filled")

    const held = (await positions())[0]
    // Bought back HIGHER than it was cut, and for the rung's own budget — not
    // for the coin count it used to hold, which at 96 would have cost more.
    expect(held.entryPx).toBeCloseTo(96, 9)
    expect(held.szi * 96).toBeLessThanOrEqual(budget + 0.01)
    expect(held.szi * 96).toBeGreaterThan(budget * 0.99)
  })

  it("starts the buy-back wait again when a candle closes back under the level", async () => {
    await place({ stopLoss: baseStop() })
    await backdate()
    await dipTo(95)
    // Bought off the 100 base, then the lower one confirms under the buy.
    candles = tapeWithBase(90, { endsAgoMs: 48 * 3_600_000 })
    await settle()

    marks.set("BTC", 89)
    await settle()

    // Above it for a while, one close back under, then above again — but only
    // for eight hours, so the wait is nowhere near a day.
    candles = tapeWithBase(90, { closes: [96, 96, 96, 96, 96, 96, 88, 96, 96] })
    marks.set("BTC", 96)
    await settle()

    expect(await positions()).toHaveLength(0)
    expect((await onlyLadder()).plan.reclaim).not.toBeNull()
  })
})

describe("measuring the rungs from the click instead", () => {
  it("hangs the ladder from the clicked price when asked to", async () => {
    // The tape's base is 100 and the click is 80, so choosing the click has
    // to change where every rung lands: 76 rather than 95.
    expect(await place({ anchor: "click" }, 80)).toEqual({
      placed: 2,
      passed: 0,
    })

    const ladder = await onlyLadder()
    expect(ladder.plan.rungs[0].px).toBe(76)
    expect(ladder.plan.anchorPx).toBe(80)
  })

  it("needs no confirmed base at all", async () => {
    // The same tape that refuses a base-anchored ladder places this one.
    candles = []
    await expect(place()).rejects.toThrow("SMART_LADDER_NO_BASE")
    expect(await place({ anchor: "click" }, 80)).toEqual({
      placed: 2,
      passed: 0,
    })
  })

  it("measures from the click rather than the base when asked to", async () => {
    // Clicked at 90 with the market at 99: the rungs come off 90, not off the
    // tape's base of 100.
    marks.set("BTC", 99)
    const ladder = await place({ anchor: "click" }, 90)
    expect(ladder).toEqual({ placed: 2, passed: 0 })
    expect((await onlyLadder()).plan.anchorPx).toBe(90)
  })

  it("still skips a rung price has already fallen past", async () => {
    // Clicked at 110 with the market at 100: rung 1 lands at 104.50, which
    // price is already below, so it never gets to wait for a drop.
    expect(await place({ anchor: "click" }, 110)).toEqual({
      placed: 1,
      passed: 1,
    })
    expect(await positions()).toHaveLength(0)
    expect((await onlyLadder()).plan.rungs[0].status).toBe("skipped")
  })
})

describe("following the base while nothing has bought", () => {
  it("moves every rung when a new base confirms", async () => {
    await place()
    let ladder = await onlyLadder()
    expect(ladder.plan.anchorPx).toBe(100)
    expect(ladder.plan.rungs[0].px).toBe(95)

    // A lower base confirms, price is still above it, nothing has bought.
    candles = tapeWithBase(90)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.plan.anchorPx).toBe(90)
    // The shape is untouched: still a 5% step then an 8% step, off 90.
    expect(ladder.plan.rungs[0].px).toBeCloseTo(85.5, 9)
    expect(ladder.plan.rungs[1].px).toBeCloseTo(78.66, 9)
  })

  it("stops following the moment a rung buys", async () => {
    await place()
    await backdate()
    await dipTo(95)
    expect((await onlyLadder()).plan.rungs[0].status).toBe("filled")

    candles = tapeWithBase(90)
    await settle()

    // Committed. Re-pricing the deeper rungs under an open position would
    // leave a ladder whose rungs no longer relate to what it paid.
    const ladder = await onlyLadder()
    expect(ladder.plan.anchorPx).toBe(100)
    expect(ladder.plan.rungs[1].px).toBeCloseTo(87.4, 9)
  })

  it("leaves a click-anchored ladder exactly where it was put", async () => {
    await place({ anchor: "click" }, 80)
    candles = tapeWithBase(90)
    await settle()

    expect((await onlyLadder()).plan.anchorPx).toBe(80)
  })
})

describe("two-green mode and rungs above the market", () => {
  it("keeps them, because price being below a rung is what it waits for", async () => {
    // Clicked at 110 with the market at 100, so rung 1 lands at 104.50. A
    // resting ladder would have missed it; this mode is watching for exactly
    // that and buys it on the next confirmation.
    expect(await place({ anchor: "click", twoGreen: true }, 110)).toEqual({
      placed: 2,
      passed: 0,
    })
    const ladder = await onlyLadder()
    expect(ladder.plan.rungs.map((rung) => rung.status)).toEqual([
      "waiting",
      "waiting",
    ])
    // Nothing rests on the book in this mode.
    expect(await orders()).toHaveLength(0)
  })
})

describe("a ladder that waits does not tie up the money for every rung", () => {
  it("is refused only when it cannot afford the rung it would buy", async () => {
    // The two rungs cost about $667 and $1,333. Park most of the account in a
    // manual position so roughly $1,390 is free: the whole ladder is
    // unaffordable, the biggest single rung is not. Asking for the whole cost
    // up front — the old rule — refused exactly this ladder.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 86,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    expect(await place()).toEqual({ placed: 2, passed: 0 })
  })

  it("still refuses when even one rung is out of reach", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 95,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    await expect(place()).rejects.toThrow("SMART_LADDER_COST")
    expect(await ladderRows()).toHaveLength(0)
  })
})

describe("may this ladder open a new coin", () => {
  const bookWith = (over: {
    held?: boolean
    cascading?: boolean
    leastLeverage?: number | null
    entryLimit?: { coins: number; withinHours: number } | null
    openedAt?: number[]
  }) =>
    ({
      positions: new Map(
        over.held
          ? [[BTC, { szi: 1, entryPx: 100, leverage: 1, maxLeverage: 50 }]]
          : []
      ),
      crashEntry: {
        cascading: over.cascading ?? false,
        leastLeverage: over.leastLeverage ?? null,
      },
      entryLimit: over.entryLimit ?? null,
      openedAt: over.openedAt ?? [],
    }) as unknown as Parameters<typeof mayOpenCoin>[0]

  const NOW = Date.parse("2025-10-10T20:30:00Z")

  it("never limits adding to a coin already held", () => {
    const book = bookWith({
      held: true,
      cascading: true,
      leastLeverage: 100,
      entryLimit: { coins: 1, withinHours: 1 },
      openedAt: [NOW - 60_000],
    })
    expect(mayOpenCoin(book, BTC, 3, NOW)).toBe(true)
  })

  it("blocks a low-leverage coin only while the market is cascading", () => {
    expect(
      mayOpenCoin(bookWith({ cascading: true, leastLeverage: 10 }), BTC, 3, NOW)
    ).toBe(false)
    expect(
      mayOpenCoin(
        bookWith({ cascading: false, leastLeverage: 10 }),
        BTC,
        3,
        NOW
      )
    ).toBe(true)
    expect(
      mayOpenCoin(
        bookWith({ cascading: true, leastLeverage: 10 }),
        BTC,
        10,
        NOW
      )
    ).toBe(true)
  })

  it("blocks a coin past the wallet's entry allowance", () => {
    const used = bookWith({
      entryLimit: { coins: 2, withinHours: 1 },
      openedAt: [NOW - 20 * 60_000, NOW - 10 * 60_000],
    })
    expect(mayOpenCoin(used, BTC, 50, NOW)).toBe(false)
    // The same two entries an hour later are outside the window.
    expect(mayOpenCoin(used, BTC, 50, NOW + 3_600_000)).toBe(true)
  })
})
