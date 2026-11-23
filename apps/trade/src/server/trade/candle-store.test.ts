import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import { tradeCandleSplits, tradeCandles } from "@/server/trade/schema"
import {
  adjustStoredSplits,
  ensureCandleCoverage,
  listCandleGaps,
  loadStoredCandles,
  repairStoredSplits,
  splitBetween,
} from "@/server/trade/candle-store"

/**
 * The candle store's whole job is to fetch each stretch of history once and be
 * honest about what the exchange did not have. Both halves are checked here
 * against a scripted exchange: the second ask must reach it not at all, and a
 * coin younger than the window must report the shortfall rather than quietly
 * testing a shorter period.
 */

const HOUR = 3_600_000
const FOUR_HOURS = 4 * HOUR

/** Every range the fake protocol was asked for, in order. */
const asks: Array<{
  protocol: string
  marketId: string
  interval: string
  from: number
  to: number
}> = []

/** The bars the fake exchange actually holds, by open time. */
let available: CandleBar[] = []
/** When set, each timeframe answers with its own bars instead of `available`. */
let availableFor: Record<string, CandleBar[]> | null = null
let failFromOnce: number | null = null

/** What the fake exchanges say their history batch is; unset means no cap. */
const FAKE_BATCH_BARS: Record<string, number | undefined> = { aster: 9_000 }

/** Which fake source only has bars during its market's hours. */
const SESSION_ONLY: Record<string, boolean | undefined> = { dukascopy: true }
/** Which fake source publishes splits as they traded. */
const RAW_SPLITS: Record<string, boolean | undefined> = { dukascopy: true }

// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: (protocol: string) => ({
    markets: {
      historyBatchBars: FAKE_BATCH_BARS[protocol],
      barsOnlyInSession: SESSION_ONLY[protocol],
      pricesCarrySplits: RAW_SPLITS[protocol],
      intervalMs: (interval: string) =>
        interval === "1h" ? HOUR : interval === "1d" ? 24 * HOUR : FOUR_HOURS,
      history: async (
        _network: string,
        marketId: string,
        interval: string,
        from: number,
        to: number
      ) => {
        asks.push({ protocol, marketId, interval, from, to })
        if (failFromOnce === from) {
          failFromOnce = null
          throw new Error("the exchange said no")
        }
        return (availableFor?.[interval] ?? available).filter(
          (bar) => bar.openTime >= from && bar.openTime < to
        )
      },
    },
  }),
}))

function bars(
  fromTime: number,
  count: number,
  step: number = FOUR_HOURS
): CandleBar[] {
  return Array.from({ length: count }, (_, index) => ({
    openTime: fromTime + index * step,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }))
}

const KEY = "hyperliquid:mainnet:BTC"
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  asks.length = 0
  availableFor = null
  failFromOnce = null
  available = bars(START, 100)
})

afterEach(async () => {
  await client.close()
})

describe("asking for a window twice", () => {
  it("fetches the second time not at all", async () => {
    const to = START + 100 * FOUR_HOURS
    const first = await ensureCandleCoverage(KEY, "4h", START, to, db)
    expect(first.barCount).toBe(100)
    expect(asks).toHaveLength(1)

    const second = await ensureCandleCoverage(KEY, "4h", START, to, db)
    expect(second.barCount).toBe(100)
    // The point of the whole store: nothing new was asked of the exchange.
    expect(asks).toHaveLength(1)
  })

  it("stores every bar once, however often it is asked for", async () => {
    const to = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, to, db)
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    const stored = await loadStoredCandles(KEY, "4h", START, to, db)
    expect(stored).toHaveLength(100)
    expect(new Set(stored.map((bar) => bar.openTime)).size).toBe(100)
  })
})

describe("widening a window", () => {
  it("fetches only the ends sticking out", async () => {
    available = bars(START - 50 * FOUR_HOURS, 200)

    const middleFrom = START
    const middleTo = START + 50 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", middleFrom, middleTo, db)
    asks.length = 0

    await ensureCandleCoverage(
      KEY,
      "4h",
      middleFrom - 20 * FOUR_HOURS,
      middleTo + 20 * FOUR_HOURS,
      db
    )

    // Two ends, and neither of them touches the middle that was already there.
    expect(asks.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: middleFrom - 20 * FOUR_HOURS, to: middleFrom },
      { from: middleTo, to: middleTo + 20 * FOUR_HOURS },
    ])
  })

  it("never forgets the wider window it already had", async () => {
    const wideTo = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, wideTo, db)
    asks.length = 0

    // A narrower ask afterwards must not shrink what is known, or the next
    // wide ask would fetch the whole thing again.
    await ensureCandleCoverage(KEY, "4h", START + 10 * FOUR_HOURS, wideTo, db)
    await ensureCandleCoverage(KEY, "4h", START, wideTo, db)

    expect(asks).toEqual([])
  })

  it("does not claim an unfetched middle between separate windows", async () => {
    const firstTo = START + 100 * FOUR_HOURS
    const lastFrom = START + 3_000 * FOUR_HOURS
    const lastTo = lastFrom + 100 * FOUR_HOURS
    available = [
      ...bars(START, 100),
      ...bars(START + 1_500 * FOUR_HOURS, 100),
      ...bars(lastFrom, 100),
    ]

    await ensureCandleCoverage(KEY, "4h", START, firstTo, db)
    await ensureCandleCoverage(KEY, "4h", lastFrom, lastTo, db)
    asks.length = 0

    const middleFrom = START + 1_500 * FOUR_HOURS
    const middleTo = middleFrom + 100 * FOUR_HOURS
    const report = await ensureCandleCoverage(
      KEY,
      "4h",
      middleFrom,
      middleTo,
      db
    )

    expect(asks.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: middleFrom, to: middleTo },
    ])
    expect(report.barCount).toBe(100)
  })
})

describe("a coin the exchange does not go back far enough for", () => {
  it("reports what it really has and records the shortfall", async () => {
    // Listed 20 bars in: nothing before that exists anywhere.
    const listedAt = START + 20 * FOUR_HOURS
    available = bars(listedAt, 80)

    const to = START + 100 * FOUR_HOURS
    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(80)
    expect(report.firstBar).toBe(listedAt)
    expect(report.gaps).toEqual([
      { from: START, to: listedAt, reason: expect.stringContaining("no price") },
    ])
  })

  it("keeps the shortfall on record for the results page", async () => {
    const listedAt = START + 20 * FOUR_HOURS
    available = bars(listedAt, 80)
    const to = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    const gaps = await listCandleGaps(KEY, "4h", START, to, db)
    expect(gaps).toEqual([
      { from: START, to: listedAt, reason: expect.any(String) },
    ])
  })

  it("records the same shortfall once, not once per run", async () => {
    const listedAt = START + 20 * FOUR_HOURS
    available = bars(listedAt, 80)
    const to = START + 100 * FOUR_HOURS

    await ensureCandleCoverage(KEY, "4h", START, to, db)
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(await listCandleGaps(KEY, "4h", START, to, db)).toHaveLength(1)
  })

  it("says so plainly when there is no history at all", async () => {
    available = []
    const to = START + 100 * FOUR_HOURS
    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(0)
    expect(report.firstBar).toBeNull()
    expect(report.gaps[0].reason).toContain("no price history at all")
  })
})

describe("a hole in the middle of a window", () => {
  it("is written down rather than closed over", async () => {
    // Ten bars, then five days of nothing, then ten more.
    available = [...bars(START, 10), ...bars(START + 40 * FOUR_HOURS, 10)]
    const to = START + 50 * FOUR_HOURS

    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(20)
    expect(report.gaps).toEqual([
      {
        from: START + 10 * FOUR_HOURS,
        to: START + 40 * FOUR_HOURS,
        reason: expect.any(String),
      },
    ])
  })

  it("records even a single missing bar", async () => {
    available = bars(START, 20).filter(
      (bar) => bar.openTime !== START + 5 * FOUR_HOURS
    )
    const to = START + 20 * FOUR_HOURS

    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(19)
    expect(report.gaps).toEqual([
      {
        from: START + 5 * FOUR_HOURS,
        to: START + 6 * FOUR_HOURS,
        reason: expect.any(String),
      },
    ])
  })
})

describe("a failed fetch", () => {
  it("leaves the window looking un-asked, so it is retried", async () => {
    const to = START + 100 * FOUR_HOURS
    failFromOnce = START

    await expect(
      ensureCandleCoverage(KEY, "4h", START, to, db)
    ).rejects.toThrow("the exchange said no")

    // Remembering the failure as "there is nothing there" would mean never
    // looking again.
    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)
    expect(report.barCount).toBe(100)
  })

  it("resumes at the failed page instead of starting over", async () => {
    available = bars(START, 2_500)
    const secondPage = START + 1_000 * FOUR_HOURS
    const to = START + 2_500 * FOUR_HOURS
    failFromOnce = secondPage

    await expect(
      ensureCandleCoverage(KEY, "4h", START, to, db)
    ).rejects.toThrow("the exchange said no")
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(asks.filter((ask) => ask.from === START)).toHaveLength(1)
    expect(asks.filter((ask) => ask.from === secondPage)).toHaveLength(2)
    expect(await loadStoredCandles(KEY, "4h", START, to, db)).toHaveLength(
      2_500
    )
  })

  it("resumes an earlier extension without skipping its middle", async () => {
    const oldFrom = START + 2_500 * FOUR_HOURS
    const to = oldFrom + 100 * FOUR_HOURS
    available = bars(START, 2_600)
    await ensureCandleCoverage(KEY, "4h", oldFrom, to, db)
    asks.length = 0

    const firstPage = START
    const failedPage = START + 1_000 * FOUR_HOURS
    failFromOnce = failedPage
    await expect(
      ensureCandleCoverage(KEY, "4h", START, to, db)
    ).rejects.toThrow("the exchange said no")
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(asks.filter((ask) => ask.from === firstPage)).toHaveLength(1)
    expect(asks.filter((ask) => ask.from === failedPage)).toHaveLength(2)
    expect(await loadStoredCandles(KEY, "4h", START, to, db)).toHaveLength(
      2_600
    )
  })
})

describe("six months of hourly history", () => {
  it("stores it once in pages and reuses it on the second run", async () => {
    const count = 180 * 24
    available = bars(START, count, HOUR)
    const to = START + count * HOUR

    const first = await ensureCandleCoverage(KEY, "1h", START, to, db)
    expect(first.barCount).toBe(count)
    expect(asks).toHaveLength(5)

    await ensureCandleCoverage(KEY, "1h", START, to, db)
    expect(asks).toHaveLength(5)
  })
})

describe("the selected protocol", () => {
  it("reads Hyperliquid and Binance keys from their own adapters", async () => {
    const to = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, to, db)
    await ensureCandleCoverage(
      "binance:mainnet:BTC",
      "4h",
      START,
      to,
      db
    )

    expect(asks.map((ask) => ask.protocol)).toEqual([
      "hyperliquid",
      "binance",
    ])
  })

  it("hands Aster enough bars for its adapter to batch six full pages", async () => {
    available = []
    const to = START + 9_000 * FOUR_HOURS

    await ensureCandleCoverage(
      "aster:mainnet:BTCUSDT",
      "4h",
      START,
      to,
      db
    )

    expect(asks).toEqual([
      {
        protocol: "aster",
        marketId: "BTCUSDT",
        interval: "4h",
        from: START,
        to,
      },
    ])
  })
})

describe("a market that only trades during its exchange's hours", () => {
  const STOCK = "dukascopy:mainnet:tslaususd"
  // Monday 25 Aug 2025, midnight UTC: a fortnight safely in the past, since
  // the store never asks past the clock.
  const MONDAY = Date.parse("2025-08-25T00:00:00.000Z")
  const DAY = 86_400_000

  /** Seven hourly bars a day, 13:00 to 19:00 UTC, on the weekdays given. */
  function tradingDays(days: readonly number[]): CandleBar[] {
    return days.flatMap((day) =>
      bars(MONDAY + day * DAY + 13 * HOUR, 7, HOUR)
    )
  }

  it("records no gap for nights, weekends or one holiday", async () => {
    // Monday to Friday, then the next Monday to Friday with Wednesday off.
    available = tradingDays([0, 1, 2, 3, 4, 7, 8, 10, 11])

    const report = await ensureCandleCoverage(
      STOCK,
      "1h",
      MONDAY,
      MONDAY + 14 * DAY,
      db
    )

    expect(report.barCount).toBe(63)
    expect(report.gaps).toEqual([])
    expect(await listCandleGaps(STOCK, "1h", MONDAY, MONDAY + 14 * DAY, db)).toEqual(
      []
    )
  })

  it("records two or more silent weekdays in a row as a gap", async () => {
    // The second week's Tuesday to Thursday are missing.
    available = tradingDays([0, 1, 2, 3, 4, 7, 11])

    const report = await ensureCandleCoverage(
      STOCK,
      "1h",
      MONDAY,
      MONDAY + 14 * DAY,
      db
    )

    expect(report.gaps).toEqual([
      {
        from: MONDAY + 8 * DAY,
        to: MONDAY + 11 * DAY,
        reason: "The source had no price on these trading days.",
      },
    ])
  })

  it("says when a young market's prices begin", async () => {
    // Nothing until the second Wednesday.
    available = tradingDays([9, 10, 11])

    const report = await ensureCandleCoverage(
      STOCK,
      "1h",
      MONDAY,
      MONDAY + 14 * DAY,
      db
    )

    expect(report.gaps).toHaveLength(1)
    expect(report.gaps[0].from).toBe(MONDAY)
    expect(report.gaps[0].to).toBe(MONDAY + 9 * DAY)
    expect(report.gaps[0].reason).toContain("before 2025-09-03")
  })

  it("never judges the day still in progress", async () => {
    available = tradingDays([0, 1, 2, 3])
    // Asked at 9am on Friday, before the market opens: Thursday and the
    // half-Friday would be two silent weekdays if the partial day counted.
    const report = await ensureCandleCoverage(
      STOCK,
      "1h",
      MONDAY,
      MONDAY + 4 * DAY + 9 * HOUR,
      db
    )
    expect(report.gaps).toEqual([])
  })
})

describe("a stock split in a source's raw prices", () => {
  const STOCK = "dukascopy:mainnet:tslaususd"
  const MONDAY = Date.parse("2025-08-25T00:00:00.000Z")
  const DAY = 86_400_000

  /** Seven hourly bars a day at `price`, on the weekdays given. */
  function sessionBars(days: readonly number[], price: number): CandleBar[] {
    return days.flatMap((day) =>
      Array.from({ length: 7 }, (_, hour) => ({
        openTime: MONDAY + day * DAY + (13 + hour) * HOUR,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: 100,
      }))
    )
  }

  it("reads a whole-number step between sessions as a split, and nothing else", () => {
    const at = (day: number, price: number): CandleBar => ({
      openTime: MONDAY + day * DAY + 13 * HOUR,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 1,
    })
    // Tesla's own numbers: 2,210.99 then 443, and 890.84 then 302.54.
    expect(splitBetween(at(0, 2210.987), at(1, 442.998))).toBe(5)
    expect(splitBetween(at(0, 890.836), at(1, 302.542))).toBe(3)
    // A reverse split, one for ten.
    expect(splitBetween(at(0, 1.2), at(1, 12.1))).toBeCloseTo(0.1)
    // An ordinary fall, a fall inside one session, and a bad print.
    expect(splitBetween(at(0, 100), at(1, 70))).toBeNull()
    expect(
      splitBetween(at(0, 100), { ...at(0, 50), openTime: MONDAY + 15 * HOUR })
    ).toBeNull()
    expect(splitBetween(at(0, 0), at(1, 50))).toBeNull()
    // Friday to the Tuesday after a long weekend is still the next session.
    expect(splitBetween(at(4, 2_000), at(8, 400))).toBe(5)
    // A price that doubles across a month missing from the store is not a
    // split: Micron, $517 on 30 Apr 2026 and $1,009 on 1 Jun 2026.
    expect(splitBetween(at(0, 517.197), at(32, 1009.307))).toBeNull()
  })

  it("folds the bars before a split into today's units as they are stored", async () => {
    // Monday to Wednesday at $2,000, then a five-for-one: $400 from Thursday.
    available = [...sessionBars([0, 1, 2], 2_000), ...sessionBars([3, 4], 400)]

    await ensureCandleCoverage(STOCK, "1h", MONDAY, MONDAY + 7 * DAY, db)

    const stored = await loadStoredCandles(STOCK, "1h", MONDAY, MONDAY + 7 * DAY, db)
    expect(stored).toHaveLength(35)
    expect(stored[0].close).toBeCloseTo(400)
    expect(stored[0].volume).toBeCloseTo(500)
    expect(stored[stored.length - 1].close).toBeCloseTo(400)
    expect(stored[stored.length - 1].volume).toBe(100)
  })

  it("folds the years already stored when a split lands in a later top-up", async () => {
    available = sessionBars([0, 1, 2, 3, 4], 2_000)
    await ensureCandleCoverage(STOCK, "1h", MONDAY, MONDAY + 5 * DAY, db)
    // The same days on the four-hour feed, stored raw as well.
    available = sessionBars([0, 1, 2, 3, 4], 2_000)
    await ensureCandleCoverage(STOCK, "4h", MONDAY, MONDAY + 5 * DAY, db)

    // Next week arrives after a five-for-one.
    available = sessionBars([7, 8], 400)
    await ensureCandleCoverage(STOCK, "1h", MONDAY + 5 * DAY, MONDAY + 9 * DAY, db)

    const hours = await loadStoredCandles(STOCK, "1h", MONDAY, MONDAY + 9 * DAY, db)
    expect(hours[0].close).toBeCloseTo(400)
    expect(hours[hours.length - 1].close).toBeCloseTo(400)
    // Every timeframe of the market is folded, not only the one that saw it.
    const fours = await loadStoredCandles(STOCK, "4h", MONDAY, MONDAY + 5 * DAY, db)
    expect(fours[0].close).toBeCloseTo(400)

    // A raw page for the old stretch fetched later comes in folded too.
    available = sessionBars([5], 2_000)
    // Friday of the first week was a holiday in the fake; refetch it raw.
    const beforeCount = hours.length
    await ensureCandleCoverage(STOCK, "1h", MONDAY + 5 * DAY, MONDAY + 6 * DAY, db)
    const again = await loadStoredCandles(STOCK, "1h", MONDAY, MONDAY + 9 * DAY, db)
    expect(again.length).toBeGreaterThanOrEqual(beforeCount)
    expect(again.every((bar) => bar.close < 500)).toBe(true)
  })

  it("folds a history that was stored raw before the store knew about splits", async () => {
    // Stored by hand, the way rows written before 2 Sep 2026 were.
    const raw = [...sessionBars([0, 1], 2_000), ...sessionBars([2, 3], 400)]
    await db.insert(tradeCandles).values(
      raw.map((bar) => ({ marketKey: STOCK, interval: "1h" as const, ...bar }))
    )

    const found = await adjustStoredSplits(STOCK, db)

    expect(found).toEqual([{ at: MONDAY + 2 * DAY, ratio: 5 }])
    const stored = await loadStoredCandles(STOCK, "1h", MONDAY, MONDAY + 7 * DAY, db)
    expect(stored.every((bar) => Math.abs(bar.close - 400) < 1)).toBe(true)
    // Asking again finds nothing: the step is gone.
    expect(await adjustStoredSplits(STOCK, db)).toEqual([])
  })

  /** Two four-hour bars a day at `price`, at 12:00 and 16:00. */
  function fourHourBars(days: readonly number[], price: number): CandleBar[] {
    return days.flatMap((day) =>
      [12, 16].map((hour) => ({
        openTime: MONDAY + day * DAY + hour * HOUR,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: 350,
      }))
    )
  }

  /** One daily bar a day at `price`, at midnight. */
  function dailyBars(days: readonly number[], price: number): CandleBar[] {
    return days.map((day) => ({
      openTime: MONDAY + day * DAY,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 700,
    }))
  }

  /**
   * A five-for-one on Thursday, the way Dukascopy sends it. Its daily file
   * gets the split day wrong as it did Amazon's: opened at the Wednesday close
   * divided by five, and a low of that divided by five again.
   */
  function splitWeek() {
    const [thursday, ...friday] = dailyBars([3, 4], 400)
    return {
      "1h": [...sessionBars([0, 1, 2], 2_000), ...sessionBars([3, 4], 400)],
      "4h": [...fourHourBars([0, 1, 2], 2_000), ...fourHourBars([3, 4], 400)],
      "1d": [
        ...dailyBars([0, 1, 2], 2_000),
        { ...thursday, open: 400, low: 80 },
        ...friday,
      ],
    }
  }

  it("finds one split whichever timeframe sees it first", async () => {
    availableFor = splitWeek()
    // The four-hour bars first: they see the split at 12:00 on Thursday.
    await ensureCandleCoverage(STOCK, "4h", MONDAY, MONDAY + 5 * DAY, db)
    await ensureCandleCoverage(STOCK, "1d", MONDAY, MONDAY + 5 * DAY, db)

    const splits = await db.select().from(tradeCandleSplits)
    expect(splits.map(({ at, ratio }) => ({ at, ratio }))).toEqual([
      { at: MONDAY + 3 * DAY, ratio: 5 },
    ])
    for (const interval of ["4h", "1d"] as const) {
      const stored = await loadStoredCandles(STOCK, interval, MONDAY, MONDAY + 5 * DAY, db)
      expect(stored.every((bar) => Math.abs(bar.close - 400) < 1)).toBe(true)
    }
  })

  it("builds the split day's daily bar from its hours", async () => {
    availableFor = splitWeek()
    await ensureCandleCoverage(STOCK, "1d", MONDAY, MONDAY + 5 * DAY, db)

    const days = await loadStoredCandles(STOCK, "1d", MONDAY, MONDAY + 5 * DAY, db)
    const thursday = days.find((bar) => bar.openTime === MONDAY + 3 * DAY)
    expect(thursday?.open).toBeCloseTo(400)
    expect(thursday?.low).toBeCloseTo(396)
    expect(thursday?.high).toBeCloseTo(404)
    expect(thursday?.volume).toBe(700)
    // Every other day is the daily file's own.
    expect(days[0].low).toBeCloseTo(396)
    expect(days[0].volume).toBeCloseTo(3_500)
  })

  it("rebuilds the split day when the split is found after the daily bar is stored", async () => {
    // The daily bars for the split week went in before the store looked for
    // splits, raw, and the four-hour fill then finds it.
    availableFor = splitWeek()
    await db.insert(tradeCandles).values(
      availableFor["1d"].map((bar) => ({ marketKey: STOCK, interval: "1d" as const, ...bar }))
    )
    await ensureCandleCoverage(STOCK, "4h", MONDAY, MONDAY + 5 * DAY, db)

    const days = await loadStoredCandles(STOCK, "1d", MONDAY, MONDAY + 5 * DAY, db)
    expect(days.every((bar) => bar.low > 390 && bar.high < 410)).toBe(true)
  })

  it("repairs a split recorded at the four-hour bar's time", async () => {
    // What the old rule left: a record at Thursday 12:00, so Thursday's
    // already-new daily bar was divided by five as well.
    const week = splitWeek()
    const thursdayNoon = MONDAY + 3 * DAY + 12 * HOUR
    const foldedOnce = (bar: CandleBar) =>
      bar.openTime < thursdayNoon
        ? { ...bar, open: bar.open / 5, high: bar.high / 5, low: bar.low / 5, close: bar.close / 5, volume: bar.volume * 5 }
        : bar
    for (const interval of ["4h", "1d"] as const) {
      await db.insert(tradeCandles).values(
        week[interval].map((bar) => ({ marketKey: STOCK, interval, ...foldedOnce(bar) }))
      )
    }
    await db.insert(tradeCandleSplits).values({ marketKey: STOCK, at: thursdayNoon, ratio: 5 })
    availableFor = week

    const found = await repairStoredSplits(STOCK, db)

    expect(found).toEqual([{ at: MONDAY + 3 * DAY, ratio: 5 }])
    for (const interval of ["4h", "1d"] as const) {
      const stored = await loadStoredCandles(STOCK, interval, MONDAY, MONDAY + 5 * DAY, db)
      expect(stored.every((bar) => bar.low > 390 && bar.high < 410)).toBe(true)
    }
    // Running it again changes nothing.
    expect(await repairStoredSplits(STOCK, db)).toEqual([{ at: MONDAY + 3 * DAY, ratio: 5 }])
  })
})
