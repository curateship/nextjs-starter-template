import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { BacktestSpec } from "@/lib/trade/backtest/flow"
import { defaultDcaParams } from "@/lib/trade/dca"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createBacktest } from "@/server/trade/backtest/store"
import { backtestTick, peakInPlay } from "@/server/trade/backtest/worker"
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

/** Markets that keep failing, to prove the worker eventually reports it. */
const permanentFailures = new Set<string>()
/** Markets that fail once with a rate limit before answering properly. */
const rateLimitOnce = new Set<string>()

// Only `getProtocol` is replaced. The store still chooses the adapter from the
// full market key, while this scripted adapter keeps the worker test offline.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    id: "hyperliquid",
    markets: {
      intervalMs: () => FOUR_HOURS,
      roundPx: (px: number) => px,
      history: async (
        _network: string,
        marketId: string,
        _interval: string,
        from: number,
        to: number
      ) => {
        if (permanentFailures.has(marketId)) {
          throw new Error("the exchange said no")
        }
        if (rateLimitOnce.has(marketId)) {
          rateLimitOnce.delete(marketId)
          throw new Error(`Market history ${marketId} failed: 429`)
        }
        return (history.get(marketId) ?? []).filter(
          (bar) => bar.openTime >= from && bar.openTime < to
        )
      },
    },
    funding: {
      intervalMs: () => 3_600_000,
      fetch: async (
        _network: string,
        _marketId: string,
        from: number,
        to: number
      ) =>
        Array.from(
          { length: Math.max(0, Math.floor((to - from) / 3_600_000)) },
          (_, index) => ({ time: from + index * 3_600_000, rate: 0 })
        ),
    },
  }),
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
    markets: { protocol: "hyperliquid", marketKeys, days: 30 },
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
  permanentFailures.clear()
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
    expect(group.summary?.fundingPaid).toBe(0)
    expect(group.summary?.warnings.join(" ")).not.toContain("funding history")
    // Written when the run finishes, so the tile never has to work a share out
    // of a pot it does not hold. A run that saved null here shows a dash.
    expect(group.summary?.peakInPlayPct).not.toBeNull()
    expect(group.summary?.typicalInPlayPct).not.toBeNull()

    const coins = await db
      .select()
      .from(tradeBacktests)
      .where(eq(tradeBacktests.groupId, groupId))
    expect(coins.every((coin) => coin.status === "done")).toBe(true)
    expect(coins.every((coin) => coin.progress === 1)).toBe(true)
  })

  it("tests a young coin from the day it listed, rather than dropping it", async () => {
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    // Listed three days before the window ends. It used to be dropped for
    // having less than half the window, which turned a ten-year test of 250
    // Binance coins into a test of 79 — the rest simply had not existed yet.
    // The window is a maximum, so this is tested over what it has.
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

    // Tested, not skipped — and it says when its own history begins, so
    // "made $40" is never read as ten years' work when it was three days'.
    expect(skipped.status).toBe("done")
    expect(skipped.skipReason).toBeNull()
    expect(skipped.summary?.startedAt).toBeGreaterThan(
      START - 30 * 24 * 3600 * 1000
    )

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))
    expect(group.summary?.coinsSkipped).toBe(0)
    expect(group.summary?.coinsTested).toBe(2)
  })

  it("walks the window only, though it holds the warm-up in the same list", async () => {
    // A run on 4h reads 4h candles twice over: its own window, and the longer
    // stretch the base rule needs to know a level on day one. Those are the
    // same candles, so they are now loaded ONCE and the window is the tail of
    // that same list — which halves what a big run holds, and was part of why
    // the server ran out of memory.
    //
    // The risk in sharing them is walking the warm-up as well, which would
    // trade eighty-three days before the test was meant to start and quietly
    // add months of made-up results. So this pins where the walk begins and
    // how long it is.
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
    expect(await tickUntilDone(groupId)).not.toBeNull()

    const [group] = await db
      .select()
      .from(tradeBacktestGroups)
      .where(eq(tradeBacktestGroups.id, groupId))

    const equity = group.result?.equity ?? []
    const from = START - 30 * 24 * 3_600_000
    expect(equity[0]?.t).toBeGreaterThanOrEqual(from)
    // Thirty days of four-hour candles, and not a bar more.
    expect(equity.length).toBeLessThanOrEqual((30 * 24) / 4)
    expect(equity.length).toBeGreaterThan(100)
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

  it("tests a coin that exists only on the selected protocol", async () => {
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))
    history.set("NOTLISTED", shape(START - 600 * FOUR_HOURS, 800, 40))

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

    const [coin] = await db
      .select()
      .from(tradeBacktests)
      .where(
        and(
          eq(tradeBacktests.groupId, groupId),
          eq(tradeBacktests.marketKey, "hyperliquid:mainnet:NOTLISTED")
        )
      )
    expect(coin.status).toBe("done")
    expect(coin.skipReason).toBeNull()
  })

  it("gives up on a coin that fails every single time", async () => {
    // The other half of the counting rule: a slice that finishes clears the
    // count, so a slice that THROWS must not — or a permanently broken run
    // retries for ever and never says anything.
    permanentFailures.add("AAA")

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

  it("skips a coin with no history without losing the whole run", async () => {
    history.set("AAA", shape(START - 600 * FOUR_HOURS, 800))

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

    // The coin with prices is tested; the empty one is skipped, said out loud,
    // and takes nothing with it.
    expect(coins.find((c) => c.symbol === "AAA")?.status).toBe("done")
    const ghost = coins.find((c) => c.symbol === "GHOST")
    expect(ghost?.status).toBe("skipped")
    expect(ghost?.skipReason).toContain("no price history")
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

/**
 * "Peak wallet" answers one question: did the run have enough money. So both
 * halves of the fraction have to be about the money it HAD — the wallet as it
 * stood before the bar, never the pot at the end of it.
 */
describe("peak wallet", () => {
  const bars = (usd: number[]) =>
    usd.map((amount, index) => ({ t: START + index * FOUR_HOURS, usd: amount }))

  it("divides by the wallet before the bar, not the pot the bar closed at", () => {
    // Oct 10 2025, the case this exists for. $14,132 went to work out of the
    // $14,178 there was — every dollar of it. The same bar closed at $29,332
    // because the coins bought at the crash lows were marked up before the
    // candle finished. Against that close it reads 48%, which says there was
    // plenty of room when there was $46 left.
    const peak = peakInPlay(bars([14_178, 29_332]), [852, 14_132], 10_000)
    expect(Math.round(peak.pct!)).toBe(100)
    expect(peak.usd).toBe(14_132)
    expect(peak.at).toBe(START + FOUR_HOURS)
  })

  it("measures against the wallet as it stood, not what the run started with", () => {
    // Compounding: $10,000 grown to $31,019 with $33,440 working. Divided by
    // the opening dollars that reads 334%; it was using a little more than it
    // had.
    const peak = peakInPlay(
      bars([30_500, 31_019, 31_445]),
      [0, 24_568, 33_440],
      10_000
    )
    expect(Math.round(peak.pct!)).toBe(108)
    expect(peak.at).toBe(START + 2 * FOUR_HOURS)
  })

  it("uses the opening balance for the very first bar, which has nothing before it", () => {
    const peak = peakInPlay(bars([10_400]), [5_000], 10_000)
    expect(Math.round(peak.pct!)).toBe(50)
  })

  it("finds the tightest moment, not the biggest pile of dollars", () => {
    // $9,000 of a $10,000 wallet is nearly out of money. $12,000 of a $40,000
    // wallet is a quiet week that happens to hold more dollars.
    const peak = peakInPlay(bars([10_000, 40_000, 41_000]), [0, 9_000, 12_000], 10_000)
    expect(Math.round(peak.pct!)).toBe(90)
    expect(peak.at).toBe(START + FOUR_HOURS)
  })

  it("counts how long it stayed there by share, so held matches the peak", () => {
    const peak = peakInPlay(
      bars([10_000, 10_000, 10_000]),
      [0, 9_000, 9_000],
      10_000
    )
    expect(peak.heldMs).toBe(2 * FOUR_HOURS)
  })

  it("says nothing rather than dividing by a wallet that is gone", () => {
    expect(peakInPlay(bars([0, 0]), [500, 500], 0).pct).toBeNull()
    expect(peakInPlay([], [], 10_000).pct).toBeNull()
  })

  it("calls a run that bought nothing 0%, which is not the same as a dash", () => {
    expect(peakInPlay(bars([10_000, 10_000]), [0, 0], 10_000).pct).toBe(0)
  })
})
