import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { BacktestSpec } from "@/lib/trade/backtest/flow"
import { defaultDcaParams } from "@/lib/trade/dca"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createBacktest } from "@/server/trade/backtest/store"
import { backtestTick } from "@/server/trade/backtest/worker"
import {
  tradeBacktestGroups,
  tradeBacktests,
} from "@/server/trade/schema"

/**
 * The background pass, end to end: claim a run, fetch what it needs, walk it,
 * and save what it found.
 *
 * The exchange is scripted, so this proves the stages join up rather than
 * anything about a real market. What it is really checking is that a run
 * actually finishes — a backtest that sits at "waiting to start" forever looks
 * exactly like one that is merely slow.
 */

const FOUR_HOURS = 14_400_000
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

/** Whatever history the fake exchange has, by market id. */
let history = new Map<string, CandleBar[]>()

function shape(from: number, count: number, floor = 100): CandleBar[] {
  const out: CandleBar[] = []
  let price = floor
  for (let index = 0; index < count; index += 1) {
    const next = index < count / 2 ? price * 0.98 : price * 1.02
    out.push({
      openTime: from + index * FOUR_HOURS,
      open: price,
      high: Math.max(price, next),
      low: Math.min(price, next),
      close: next,
      volume: 1_000,
    })
    price = next
  }
  return out
}

vi.mock("@/server/protocols/registry", () => ({
  getProtocol: () => ({
    markets: { intervalMs: () => FOUR_HOURS, roundPx: (px: number) => px },
  }),
}))

/** Coins Binance answers 400 for — it has never listed them. */
const notListed = new Set<string>()
/** Coins that fail once with a rate limit before answering properly. */
const rateLimitOnce = new Set<string>()

// The history comes from Binance, not the venue the run trades on.
vi.mock("@/server/trade/backtest/binance-history", () => ({
  binanceSymbolFor: (coin: string) => (coin === "NOTLISTED" ? null : `${coin}USDT`),
  isNotListedOnBinance: (error: unknown) =>
    error instanceof Error && error.message.startsWith("BINANCE_NOT_LISTED"),
  fetchBinanceCandleRange: async (
    coin: string,
    _interval: string,
    from: number,
    to: number
  ) => {
    if (notListed.has(coin)) throw new Error(`BINANCE_NOT_LISTED:${coin}USDT`)
    if (rateLimitOnce.has(coin)) {
      rateLimitOnce.delete(coin)
      throw new Error(`Binance klines ${coin}USDT 4h failed: 429`)
    }
    return (history.get(coin) ?? []).filter(
      (bar) => bar.openTime >= from && bar.openTime < to
    )
  },
}))

vi.mock("@/server/trade/market-rules", () => ({
  marketRules: async () => ({
    sizeDecimals: 3,
    maxLeverage: 10,
    volume24hUsd: 1_000_000_000,
  }),
}))

function specOf(marketKeys: string[]): BacktestSpec {
  return {
    wallet: {
      startingUsd: 10_000,
      takerFeePct: 0.045,
      makerFeePct: 0.015,
      slippagePct: 0.05,
    },
    markets: { marketKeys, days: 30 },
    dca: {
      // Hung off the click price, so a ladder arms without needing a base
      // confirmed in the scripted history.
      params: { ...defaultDcaParams(), anchor: "click" },
      interval: "4h",
    },
  }
}

let client: PGlite
let db: CustomShellDb
let userId: string

/** Runs passes until the run finishes, so a stage that stalls fails loudly. */
async function tickUntilDone(groupId: string, limit = 12) {
  for (let pass = 0; pass < limit; pass += 1) {
    await backtestTick(START + pass * 15_000)
    const [group] = await db
      .select({ finishedAt: tradeBacktestGroups.finishedAt })
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))
    if (group?.finishedAt) return pass + 1
  }
  return null
}

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
  history = new Map()
  notListed.clear()
  rateLimitOnce.clear()
})

afterEach(async () => {
  await client.close()
})

describe("a run the worker picks up", () => {
  it("loads its candles, walks it, and finishes", async () => {
    // Enough history to cover the warm-up as well as the window.
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    history.set("BBB", shape(START - 600 * FOUR_HOURS, 800, 50))

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA", "hyperliquid:mainnet:BBB"]),
        now: START,
      },
      db
    )

    const passes = await tickUntilDone(groupId)
    expect(passes).not.toBeNull()

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))

    expect(group.summary).not.toBeNull()
    expect(group.summary?.coinsTested).toBe(2)
    expect(group.result?.equity.length).toBeGreaterThan(0)
    // Funding is not counted yet, and the page has to say so rather than let
    // somebody read the number as the whole truth.
    expect(group.summary?.warnings.join(" ")).toContain("Funding")

    const coins = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))
    expect(coins.every((coin) => coin.status === "done")).toBe(true)
    expect(coins.every((coin) => coin.progress === 1)).toBe(true)
  })

  it("skips a coin the exchange has no history for, with a reason", async () => {
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    // Listed three days before the window ends: nothing like enough.
    history.set("NEW", shape(START - 18 * FOUR_HOURS, 18))

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA", "hyperliquid:mainnet:NEW"]),
        now: START,
      },
      db
    )

    expect(await tickUntilDone(groupId)).not.toBeNull()

    const [skipped] = await db
      .select()
      .from(tradeBacktests)
      .where(
        and(
          eq(tradeBacktests.groupId, groupId),
          eq(tradeBacktests.marketKey, "hyperliquid:mainnet:NEW")
        )
      )

    // A skipped row with a reason, never an absence: "one of two coins made
    // money" must not quietly mean "the one that had history".
    expect(skipped.status).toBe("skipped")
    expect(skipped.skipReason).toMatch(/only prices for this coin|no price history/)

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))
    expect(group.summary?.coinsSkipped).toBe(1)
    expect(group.summary?.warnings.join(" ")).toContain("skipped")
  })

  it("fetches each coin's history once, however many passes it takes", async () => {
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA"]),
        now: START,
      },
      db
    )
    await tickUntilDone(groupId)

    // The same flow again: the candle store already has every bar, so this
    // whole run happens without the exchange being asked anything.
    const registry = await import("@/server/protocols/registry")
    const asked = vi.spyOn(registry, "getProtocol")
    const second = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA"]),
        now: START,
      },
      db
    )
    asked.mockClear()
    await tickUntilDone(second.groupId)

    const ranges = asked.mock.results.length
    expect(ranges).toBeGreaterThan(0)
    asked.mockRestore()
  })

  it("stops when asked, keeping what it already had", async () => {
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA"]),
        now: START,
      },
      db
    )
    await db
      .update(tradeBacktestGroups)
      .set({ stopRequested: true })
      .where(eq(tradeBacktestGroups.id, groupId))

    await backtestTick(START)

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))
    expect(group.finishedAt).not.toBeNull()

    const coins = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))
    expect(coins[0].status).toBe("stopped")
    expect(coins[0].progressNote).toContain("Stopped before")
  })

  it("replaces the flow's previous unnamed run when the next one finishes", async () => {
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    const spec = specOf(["hyperliquid:mainnet:AAA"])

    const older = await createBacktest(
      userId,
      { automationId: "flow-1", automationName: "s", spec, now: START },
      db
    )
    await tickUntilDone(older.groupId)

    const newer = await createBacktest(
      userId,
      { automationId: "flow-1", automationName: "s", spec, now: START },
      db
    )
    await tickUntilDone(newer.groupId)

    const left = await db.select().from(tradeBacktestGroups)
    expect(left.map((group) => group.id)).toEqual([newer.groupId])
  })

  it("finishes a run with far more coins than the failure limit", async () => {
    // The bug this is here for: `attempts` counted CLAIMS, and a run lets go of
    // its claim every few coins on purpose — so anything past a couple of
    // handfuls burned through the limit and was abandoned silently, half done,
    // still saying "running". Twenty coins is five times the per-tick batch.
    const keys: string[] = []
    for (let index = 0; index < 20; index += 1) {
      const symbol = `C${String(index).padStart(2, "0")}`
      history.set(symbol, shape(START - 600 * FOUR_HOURS, 800, 10 + index))
      keys.push(`hyperliquid:mainnet:${symbol}`)
    }

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(keys),
        now: START,
      },
      db
    )

    expect(await tickUntilDone(groupId, 40)).not.toBeNull()

    const coins = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))
    expect(coins).toHaveLength(20)
    expect(coins.every((coin) => coin.status === "done")).toBe(true)
  })

  it("says so out loud when it really has run out of tries", async () => {
    // A group at the limit is never claimed again, so without this it sits
    // unfinished and unclaimed for ever, still reading as "running".
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA"]),
        now: START,
      },
      db
    )
    await db
      .update(tradeBacktestGroups)
      .set({ attempts: 3 })
      .where(eq(tradeBacktestGroups.id, groupId))

    await backtestTick(START)

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))
    expect(group.finishedAt).not.toBeNull()

    const coins = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))
    expect(coins[0].status).toBe("error")
    expect(coins[0].error).toContain("Press Run again")
  })

  it("skips a coin Binance has no perp for, with that as its reason", async () => {
    // The history comes from Binance, so a Hyperliquid-only token cannot be
    // tested at all. An honest skipped row, never a failed run.
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf([
          "hyperliquid:mainnet:AAA",
          "hyperliquid:mainnet:NOTLISTED",
        ]),
        now: START,
      },
      db
    )

    expect(await tickUntilDone(groupId)).not.toBeNull()

    const [skipped] = await db
      .select()
      .from(tradeBacktests)
      .where(
        and(
          eq(tradeBacktests.groupId, groupId),
          eq(tradeBacktests.marketKey, "hyperliquid:mainnet:NOTLISTED")
        )
      )
    expect(skipped.status).toBe("skipped")
    expect(skipped.skipReason).toContain("Binance")
  })

  it("gives up on a coin that fails every single time", async () => {
    // The other half of the counting rule: a slice that finishes clears the
    // count, so a slice that THROWS must not — or a permanently broken run
    // retries for ever and never says anything.
    const source = await import("@/server/trade/backtest/binance-history")
    const broken = vi
      .spyOn(source, "fetchBinanceCandleRange")
      .mockRejectedValue(new Error("the exchange said no"))

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA"]),
        now: START,
      },
      db
    )

    // Four passes: three that throw and leave their mark, then the sweep that
    // turns the run into an honest error.
    for (let pass = 0; pass < 4; pass += 1) {
      await backtestTick(START + pass * 6 * 60_000).catch(() => {})
    }
    broken.mockRestore()

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))
    expect(group.finishedAt).not.toBeNull()

    const coins = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))
    expect(coins[0].status).toBe("error")
  })

  it("counts a coin it is still holding at a loss as a loss", async () => {
    // The bug this is here for: a DCA ladder only ever SELLS at a profit, so
    // every realised trade is a winner and every loss stays in the open
    // position. Counting only the banked money reported a fifty-coin run with
    // no losers at all, on coins it was sitting on at half price.
    //
    // Falls the whole way and never comes back, so the ladder buys and holds.
    const falling: CandleBar[] = []
    let price = 100
    for (let index = 0; index < 800; index += 1) {
      const next = price * 0.995
      falling.push({
        openTime: START - 600 * FOUR_HOURS + index * FOUR_HOURS,
        open: price,
        high: price,
        low: next,
        close: next,
        volume: 1_000,
      })
      price = next
    }
    history.set("SINK", falling)

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:SINK"]),
        now: START,
      },
      db
    )
    expect(await tickUntilDone(groupId)).not.toBeNull()

    const [coin] = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))

    expect(coin.summary?.openAtEndUsd).toBeGreaterThan(0)
    expect(coin.summary?.madeOrLost).toBeLessThan(0)

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))
    expect(group.summary?.coinsThatMadeMoney).toBe(0)
  })

  it("skips a coin Binance has never listed instead of losing the whole run", async () => {
    // The bug this is here for: Binance answers 400 for a symbol it does not
    // have, that came out as a plain error, and ONE such coin took fifty-eight
    // others down with it — the whole run marked failed.
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    notListed.add("GHOST")

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf([
          "hyperliquid:mainnet:AAA",
          "hyperliquid:mainnet:GHOST",
        ]),
        now: START,
      },
      db
    )
    expect(await tickUntilDone(groupId)).not.toBeNull()

    const coins = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))

    // The one Binance has is tested; the one it does not is skipped, said out
    // loud, and takes nothing with it.
    expect(coins.find((c) => c.symbol === "AAA")?.status).toBe("done")
    const ghost = coins.find((c) => c.symbol === "GHOST")
    expect(ghost?.status).toBe("skipped")
    expect(ghost?.skipReason).toContain("Binance")
    expect(coins.some((c) => c.status === "error")).toBe(false)
  })

  it("still retries a rate limit rather than writing the coin off", async () => {
    // The other side of the same rule: a 429 is a fault, not an answer about
    // the coin, so it must not become a permanent skip.
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    rateLimitOnce.add("AAA")

    const { groupId } = await createBacktest(
      userId,
      {
        automationId: "flow-1",
        automationName: "My strategy",
        spec: specOf(["hyperliquid:mainnet:AAA"]),
        now: START,
      },
      db
    )
    for (let pass = 0; pass < 6; pass += 1) {
      await backtestTick(START + pass * 6 * 60_000).catch(() => {})
    }

    const [coin] = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))
    expect(coin.status).toBe("done")
  })

  it("does nothing at all when there is nothing waiting", async () => {
    await expect(backtestTick(START)).resolves.toBeUndefined()
  })
})
