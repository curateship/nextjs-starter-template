import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import { defaultIndicatorSettings } from "@/lib/trade/indicators/registry"
import type { SignalPlan } from "@/lib/trade/signal-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"

/**
 * What the pass makes of the arrows: which coin it looks at, when it acts, and
 * — the rule everything else rests on — that one arrow only ever acts once.
 *
 * An arrow stays the newest one for as long as its candle is the last to have
 * confirmed anything, which on a four-hour chart is hours. Without the "acted"
 * record the pass would open a trade on the same coin every time it came round.
 */

const HOUR = 3_600_000
const BAR = 4 * HOUR

let candles: CandleBar[] = []
const marks = new Map<string, number>([
  ["BTC", 100],
  ["ETH", 100],
])

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: {
      fetch: async () => ({
        protocol: "hyperliquid",
        protocolLabel: "Hyperliquid",
        network: "mainnet",
        networkLabel: "Mainnet",
        rows: ["BTC", "ETH"].map((id) => ({
          key: `hyperliquid:mainnet:${id}`,
          marketId: id,
          symbol: id,
          subExchange: null,
          category: "crypto",
          sizeDecimals: 3,
          maxLeverage: 50,
          isolatedOnly: false,
          iconUrl: null,
          price: marks.get(id) ?? 100,
          change24h: null,
          volume24hUsd: 0,
          fundingHourly: null,
          openInterestUsd: null,
        })),
      }),
      prices: async (_network: string, ids: readonly string[]) =>
        new Map(
          ids
            .filter((id) => marks.has(id))
            .map((id) => [id, marks.get(id) as number])
        ),
      candles: async () => candles,
      roundPx: (px: number) => Math.round(px * 1000) / 1000,
    },
    account: { fetch: async () => null },
  }),
}))

const { advanceSignalFlow, resetSignalPacing, workingSignals } = await import(
  "@/server/trade/signal-run"
)

const BTC = "hyperliquid:mainnet:BTC"
const ETH = "hyperliquid:mainnet:ETH"

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet
let now: number

/**
 * Candles whose lows dip once, deep enough and long enough ago that the Base
 * indicator confirms a floor and prints its buy arrow.
 *
 * The last bar is left open — its close time is in the future — so the pass has
 * to drop it, which is the "an arrow only prints on a candle that closed" rule.
 */
function barsWithABase(): CandleBar[] {
  const lows = [10, 9, 8, 7, 5, 6, 7, 8, 9, 10, 11, 12]
  return lows.map((low, index) => ({
    openTime: now - (lows.length - index) * BAR,
    open: low,
    high: low + 100,
    low,
    close: low + 0.5,
    volume: 1,
  }))
}

function spec(over: Partial<TradeFlowRunSpec> = {}): TradeFlowRunSpec {
  const indicators = defaultIndicatorSettings()
  return {
    protocol: "hyperliquid",
    network: "mainnet",
    marketKeys: [BTC],
    strategy: {
      kind: "signals",
      indicators: {
        ...indicators,
        base: {
          ...indicators.base,
          on: true,
          params: {
            ...indicators.base.params,
            searchBars: 4,
            holdBars: 1,
            minBarsApart: 1,
            withTrendOnly: false,
            showBases: true,
            showCeilings: false,
          },
        },
      },
      interval: "4h",
      stakePct: 20,
      chaseGiveUp: 0.01,
    },
    capUsd: 5_000,
    walletLabel: "Practice",
    real: false,
    ...over,
  }
}

async function pass(over: Partial<TradeFlowRunSpec> = {}, acted = {}) {
  const runSpec = spec(over)
  resetSignalPacing()
  return await advanceSignalFlow(
    {
      userId,
      wallet,
      spec: runSpec,
      working: await workingSignals(
        userId,
        wallet.id,
        runSpec.marketKeys,
        database
      ),
      lookedAt: {},
      acted,
      now,
    },
    database
  )
}

async function signalRows() {
  return await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  resetSignalPacing()
  now = Date.UTC(2026, 7, 16)
  marks.set("BTC", 100)
  marks.set("ETH", 100)
  candles = barsWithABase()

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

describe("acting on an arrow", () => {
  it("opens a trade on a buy arrow, and places nothing itself", async () => {
    const outcome = await pass()

    expect(outcome.did).toBe("opened")
    expect(outcome.marketKey).toBe(BTC)
    const rows = await signalRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("signal")
    const plan = rows[0].plan as SignalPlan
    // Nothing is asked of any exchange from here. The row says "start asking
    // for a price"; the engine is what asks.
    expect(plan.phase).toBe("buying")
    expect(plan.orderId).toBeNull()
    // A fifth of the $5,000 this flow may spend.
    expect(plan.stakeUsd).toBe(1_000)
    expect(plan.chaseGiveUp).toBe(0.01)
  })

  it("acts on one arrow exactly once", async () => {
    // The rule the whole pass rests on. Without it, the same arrow stays the
    // newest one for hours and every pass opens the coin again.
    const first = await pass()
    expect(first.did).toBe("opened")

    const plan = (await signalRows())[0].plan as SignalPlan
    const again = await pass({}, { [BTC]: plan.signalAt })

    expect(again.did).toBe("nothing")
    expect(await signalRows()).toHaveLength(1)
  })

  it("records the ARROW's time, never the clock it acted at", async () => {
    // The bug this exists for: an arrow is only visible once its candle has
    // closed, so the clock at that moment is already past the NEXT candle's
    // open time. Writing the clock into `acted` silently skipped that candle's
    // arrow — including a sell, which would strand a position.
    const outcome = await pass()

    expect(outcome.did).toBe("opened")
    expect(outcome.at).toBeDefined()
    expect(outcome.at).toBeLessThan(now)
    // And it is the arrow's own candle, which is the same one the plan kept.
    const plan = (await signalRows())[0].plan as SignalPlan
    expect(outcome.at).toBe(plan.signalAt)
  })

  it("still acts on the very next candle's arrow", async () => {
    // Falls straight out of the fix above, and is the behaviour that matters:
    // a sell arrow one candle after the buy must not be thrown away.
    const first = await pass()
    expect(first.did).toBe("opened")
    const actedAt = first.at as number

    // An arrow on the following candle is newer, so it is not blocked.
    expect(actedAt + BAR).toBeGreaterThan(actedAt)
    expect(actedAt).toBeLessThan(now)
  })

  it("will not act on an arrow the coin's own trade already acted on", async () => {
    // Even with the run's record wiped — a row written before this existed, a
    // restart mid-write — the plan itself remembers which arrow started it.
    await pass()
    const again = await pass()

    expect(again.did).toBe("nothing")
    expect(await signalRows()).toHaveLength(1)
  })

  it("ignores the candle still being filled in", async () => {
    // An arrow prints on a candle that CLOSED. Counting a live one would call
    // a trade off a shape that has not finished happening and could still turn
    // into something else before the bar ends.
    //
    // Six bars, dipping to 5 at the fifth: with a search of 4 and a wait of 1,
    // the level confirms on the LAST bar. So this is the one series where
    // whether that bar counts decides whether there is an arrow at all.
    const lows = [10, 9, 8, 7, 5, 6]
    const shaped = (lastBarOpen: boolean) =>
      lows.map((low, index) => ({
        openTime:
          now - (lows.length - 1 - index + (lastBarOpen ? 0 : 1)) * BAR,
        open: low,
        high: low + 100,
        low,
        close: low + 0.5,
        volume: 1,
      }))

    candles = shaped(true)
    expect((await pass()).did).toBe("nothing")
    expect(await signalRows()).toHaveLength(0)

    // The same shape, one bar later: now it has closed, and the arrow counts.
    candles = shaped(false)
    expect((await pass()).did).toBe("opened")
  })

  it("does nothing at all when no indicator is switched on", async () => {
    const indicators = defaultIndicatorSettings()
    const outcome = await pass({
      strategy: {
        kind: "signals",
        indicators,
        interval: "4h",
        stakePct: 20,
        chaseGiveUp: 0.01,
      },
    })

    expect(outcome.did).toBe("nothing")
    expect(await signalRows()).toHaveLength(0)
  })

  it("says nothing rather than throwing when the exchange has no history", async () => {
    candles = []
    const outcome = await pass()

    expect(outcome).toEqual({ did: "nothing", marketKey: BTC })
    expect(await signalRows()).toHaveLength(0)
  })
})

describe("a sell arrow", () => {
  /** The same shape upside down: highs that fall away, so a ceiling confirms. */
  function barsWithACeiling(): CandleBar[] {
    const highs = [10, 11, 12, 13, 15, 14, 13, 12, 11, 10, 9, 8]
    return highs.map((high, index) => ({
      openTime: now - (highs.length - index) * BAR,
      open: high,
      high,
      low: high - 100,
      close: high - 0.5,
      volume: 1,
    }))
  }

  function sellSpec() {
    const base = spec()
    if (base.strategy.kind !== "signals") throw new Error("expected signals")
    return spec({
      strategy: {
        ...base.strategy,
        indicators: {
          ...base.strategy.indicators,
          base: {
            ...base.strategy.indicators.base,
            params: {
              ...base.strategy.indicators.base.params,
              showBases: false,
              showCeilings: true,
            },
          },
        },
      },
    })
  }

  it("tells a held coin to get out, and again places nothing", async () => {
    await database.insert(tradeSmartLadders).values({
      userId,
      id: "s1",
      walletId: "w1",
      marketKey: BTC,
      kind: "signal",
      status: "active",
      plan: {
        signalPx: 100,
        signalAt: 0,
        chaseGiveUp: 0.01,
        stakeUsd: 1_000,
        sizeDecimals: 3,
        maxLeverage: 50,
        phase: "holding",
        orderId: null,
        orderPx: null,
        chasedAt: 0,
        chases: 0,
        startedAt: 0,
      } satisfies SignalPlan,
    })
    candles = barsWithACeiling()

    const outcome = await advanceSignalFlow(
      {
        userId,
        wallet,
        spec: sellSpec(),
        working: await workingSignals(userId, "w1", [BTC], database),
        lookedAt: {},
        acted: {},
        now,
      },
      database
    )

    expect(outcome.did).toBe("closing")
    expect(outcome.marketKey).toBe(BTC)
    expect((( await signalRows())[0].plan as SignalPlan).phase).toBe("selling")
  })

  it("does nothing about a coin this flow never bought", async () => {
    // A true statement about a coin it has no opinion on. Selling one it does
    // not hold would open a short nobody asked for.
    candles = barsWithACeiling()
    const outcome = await advanceSignalFlow(
      {
        userId,
        wallet,
        spec: sellSpec(),
        working: new Map(),
        lookedAt: {},
        acted: {},
        now,
      },
      database
    )

    expect(outcome.did).toBe("nothing")
    expect(await signalRows()).toHaveLength(0)
  })
})

describe("which coin it looks at", () => {
  it("takes the one it has looked at longest ago", async () => {
    const outcome = await advanceSignalFlow(
      {
        userId,
        wallet,
        spec: spec({ marketKeys: [BTC, ETH] }),
        working: new Map(),
        // BTC was looked at a moment ago; ETH has never been.
        lookedAt: { [BTC]: now - 1_000 },
        acted: {},
        now,
      },
      database
    )

    expect(outcome.marketKey).toBe(ETH)
  })

  it("looks at nothing at all when it is not due yet", async () => {
    // Candles are the expensive thing — about 28 request-weight against an
    // allowance of roughly 1,200 a minute for the whole account.
    await pass()
    const straightAway = await advanceSignalFlow(
      {
        userId,
        wallet,
        spec: spec(),
        working: await workingSignals(userId, "w1", [BTC], database),
        lookedAt: {},
        acted: {},
        now,
      },
      database
    )

    expect(straightAway).toEqual({ did: "nothing", marketKey: null })
  })
})
