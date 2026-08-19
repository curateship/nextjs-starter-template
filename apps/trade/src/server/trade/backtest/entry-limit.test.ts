import { describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { defaultDcaParams, type DcaParams } from "@/lib/trade/dca"
import { defaultPaperCosts } from "@/lib/trade/paper"
import { runBacktest, type BacktestCoin } from "@/server/trade/backtest/engine"

/**
 * The wallet's cap on how many coins it opens at once, on the day it is for.
 *
 * Twenty coins fall together. Without a cap every one of them takes its first
 * rung in the same candle and the wallet has nothing left for the rungs below,
 * which is where a ladder makes its money on a crash.
 */

const FOUR_HOURS = 14_400_000
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: { intervalMs: () => FOUR_HOURS, roundPx: (px: number) => px },
  }),
}))

const rules = { sizeDecimals: 3, priceTick: null, maxLeverage: 10, volume24hUsd: 1_000_000_000 }

function bar(i: number, o: number, h: number, l: number, c: number): CandleBar {
  return { openTime: START + i * FOUR_HOURS, open: o, high: h, low: l, close: c, volume: 1_000 }
}

/**
 * Quiet, then two separate candles that each dip through the first rung.
 *
 * Two of them on purpose. Every fill inside one candle is stamped at the same
 * moment, so a window shorter than a candle can only be seen to move by
 * carrying on into the next one.
 */
const CRASH: CandleBar[] = [
  bar(0, 100, 101, 99, 100),
  bar(1, 100, 101, 99, 100),
  bar(2, 100, 100.5, 79, 90),
  bar(3, 90, 91, 79, 88),
]

const coins = (howMany: number): BacktestCoin[] =>
  Array.from({ length: howMany }, (_, i) => ({
    marketKey: `hyperliquid:mainnet:C${i}`,
    symbol: `C${i}`,
    rules,
    bars: CRASH,
    baseBars: [],
    funding: [],
  }))

const params = (over: Partial<DcaParams> = {}): DcaParams => ({
  ...defaultDcaParams(),
  anchor: "click",
  maxPositionPct: 10,
  leverage: 2,
  ...over,
})

async function run(entryLimit: DcaParams["entryLimit"]) {
  const outcome = await runBacktest({
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingUsd: 10_000,
    costs: defaultPaperCosts(),
    strategy: { kind: "dca" as const, params: params({ entryLimit }) },
    interval: "4h" as const,
    coins: coins(20),
    from: START,
    to: START + CRASH.length * FOUR_HOURS,
  })
  const opened = new Set<string>()
  for (const coin of outcome.coins) {
    if (coin.fills.some((fill) => fill.side === "buy")) opened.add(coin.marketKey)
  }
  return { outcome, opened: opened.size }
}

describe("how many coins a run may open at once", () => {
  it("opens every coin it can when there is no limit", async () => {
    const { opened } = await run(null)
    expect(opened).toBeGreaterThan(5)
  })

  it("stops at the limit", async () => {
    const { opened } = await run({ coins: 3, withinHours: 24 })
    expect(opened).toBeLessThanOrEqual(3)
  })

  it("holds the rung rather than cancelling it", async () => {
    // Three a day never gets past three. Three an hour lets the second candle
    // open three more, because the rungs held back were left where they were
    // rather than written off.
    const perDay = await run({ coins: 3, withinHours: 24 })
    const perHour = await run({ coins: 3, withinHours: 1 })
    expect(perDay.opened).toBe(3)
    expect(perHour.opened).toBeGreaterThan(3)
  })
})
