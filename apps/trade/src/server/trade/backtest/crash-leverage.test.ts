import { describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { defaultCascade } from "@/lib/trade/cascade"
import { defaultDcaParams, type DcaParams } from "@/lib/trade/dca"
import { defaultPaperCosts } from "@/lib/trade/paper"
import { runBacktest, type BacktestCoin } from "@/server/trade/backtest/engine"

/**
 * Only open the coins the exchange gives room on, while the market is falling
 * off a cliff.
 *
 * The exchange holds back half the margin needed at a coin's top leverage, so
 * at 2x a coin capped at 3x is closed out 33% below its average entry and one
 * capped at 10x waits until 45%. With rungs 30% apart, the 3x coins are closed
 * almost exactly where the next rung would have bought.
 */

const FOUR_HOURS = 14_400_000
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: { intervalMs: () => FOUR_HOURS, roundPx: (px: number) => px },
  }),
}))

function bar(i: number, o: number, h: number, l: number, c: number): CandleBar {
  return { openTime: START + i * FOUR_HOURS, open: o, high: h, low: l, close: c, volume: 1_000 }
}

/** Quiet, then one candle down 60% — deep and wide enough to count as a crash. */
const CRASH: CandleBar[] = [
  bar(0, 100, 101, 99, 100),
  bar(1, 100, 101, 99, 100),
  bar(2, 100, 100.5, 40, 60),
  bar(3, 60, 62, 58, 60),
]

/** Half the list on 3x, half on 10x, all falling together. */
function coins(howMany: number): BacktestCoin[] {
  return Array.from({ length: howMany }, (_, i) => ({
    marketKey: `hyperliquid:mainnet:C${i}`,
    symbol: `C${i}`,
    rules: {
      sizeDecimals: 3,
      priceTick: null,
      maxLeverage: i % 2 === 0 ? 3 : 10,
      volume24hUsd: 1_000_000_000,
    },
    bars: CRASH,
    baseBars: [],
    funding: [],
  }))
}

const params = (leastLeverage: number | null): DcaParams => ({
  ...defaultDcaParams(),
  anchor: "click",
  maxPositionPct: 10,
  leverage: 2,
  cascade: { ...defaultCascade(), leastLeverage },
})

async function run(leastLeverage: number | null) {
  const outcome = await runBacktest({
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingUsd: 10_000,
    costs: defaultPaperCosts(),
    strategy: { kind: "dca" as const, params: params(leastLeverage) },
    interval: "4h" as const,
    coins: coins(20),
    from: START,
    to: START + CRASH.length * FOUR_HOURS,
  })
  const opened = outcome.coins.filter((coin) =>
    coin.fills.some((fill) => fill.side === "buy")
  )
  return {
    low: opened.filter((c) => Number(c.marketKey.split("C")[1]) % 2 === 0).length,
    high: opened.filter((c) => Number(c.marketKey.split("C")[1]) % 2 === 1).length,
  }
}

describe("which coins may be opened while the market falls off a cliff", () => {
  it("opens both kinds when the rule is off", async () => {
    const { low, high } = await run(null)
    expect(low).toBeGreaterThan(0)
    expect(high).toBeGreaterThan(0)
  })

  it("opens only the ones the exchange gives room on", async () => {
    const { low, high } = await run(10)
    expect(low).toBe(0)
    expect(high).toBeGreaterThan(0)
  })
})
