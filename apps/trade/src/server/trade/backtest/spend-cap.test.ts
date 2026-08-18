import { describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { defaultDcaParams, type DcaParams } from "@/lib/trade/dca"
import { defaultPaperCosts } from "@/lib/trade/paper"
import { runBacktest, type BacktestCoin } from "@/server/trade/backtest/engine"

/**
 * What a run is allowed to spend, on the day everything falls at once.
 *
 * **10 October 2025.** A wallet worth $10,151 bought $125,274 of coin inside
 * one four-hour candle — 208 fills across 67 coins — and the pot leapt from
 * $10,151 to $119,175 in that single bar. No account can do that: the margin
 * behind a position cannot be more than the account is worth, and this is the
 * shape that proves it, one crashing candle across several coins at once.
 */

const FOUR_HOURS = 14_400_000
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: { intervalMs: () => FOUR_HOURS, roundPx: (px: number) => px },
  }),
}))

const rules = { sizeDecimals: 3, maxLeverage: 10, volume24hUsd: 1_000_000_000 }

function bar(i: number, o: number, h: number, l: number, c: number): CandleBar {
  return { openTime: START + i * FOUR_HOURS, open: o, high: h, low: l, close: c, volume: 1_000 }
}

/**
 * Quiet, then one candle that falls 45% and closes a third of the way back —
 * the shape of 10 October 2025 on a real coin, which fell 57% inside the bar
 * and closed 27% down. Deep enough to fill every rung, shallow enough that the
 * wallet lives to be measured.
 */
const CRASH: CandleBar[] = [
  bar(0, 100, 101, 99, 100),
  bar(1, 100, 101, 99, 100),
  bar(2, 100, 100.5, 55, 73),
  bar(3, 73, 75, 72, 74),
]

function coins(howMany: number): BacktestCoin[] {
  return Array.from({ length: howMany }, (_, i) => ({
    marketKey: `hyperliquid:mainnet:C${i}`,
    symbol: `C${i}`,
    rules,
    bars: CRASH,
    baseBars: [],
    funding: [],
  }))
}

function params(over: Partial<DcaParams> = {}): DcaParams {
  return {
    ...defaultDcaParams(),
    anchor: "click",
    // A small share each, so no single coin exhausts the wallet and all
    // twenty are still buying when the candle falls — which is the shape of
    // the real day: 67 coins filling at once.
    maxPositionPct: 10,
    leverage: 2,
    ...over,
  }
}

describe("the day everything falls at once", () => {
  it("never posts more margin than the wallet is worth", async () => {
    const outcome = await runBacktest({
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      startingUsd: 10_000,
      costs: defaultPaperCosts(),
      strategy: { kind: "dca" as const, params: params() },
      interval: "4h" as const,
      coins: coins(20),
      from: START,
      to: START + CRASH.length * FOUR_HOURS,
    })

    const worst = outcome.equity.reduce(
      (found, point, i) => {
        const margin = outcome.inPlay[i] ?? 0
        const ratio = point.usd > 0 ? margin / point.usd : 0
        return ratio > found.ratio
          ? { ratio, pot: point.usd, margin, at: point.t }
          : found
      },
      { ratio: 0, pot: 0, margin: 0, at: 0 }
    )

    const buys = outcome.coins.flatMap((one) => one.fills).filter((f) => f.side === "buy")
    // It has to actually trade, or the rest proves nothing.
    expect(buys.length).toBeGreaterThan(10)
    // The margin behind everything open is never more than the account is
    // worth. Above one is money the wallet did not have.
    expect(worst.margin).toBeLessThanOrEqual(worst.pot + 1)
  })

  it("does not multiply the pot inside a single candle", async () => {
    const outcome = await runBacktest({
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      startingUsd: 10_000,
      costs: defaultPaperCosts(),
      strategy: { kind: "dca" as const, params: params() },
      interval: "4h" as const,
      coins: coins(20),
      from: START,
      to: START + CRASH.length * FOUR_HOURS,
    })

    const equity = outcome.equity
    let biggest = 1
    for (let i = 1; i < equity.length; i += 1) {
      if (equity[i - 1].usd > 0) {
        biggest = Math.max(biggest, equity[i].usd / equity[i - 1].usd)
      }
    }
    // Buying at the bottom of the wick and marking it at the recovery is where
    // an 11× bar came from. A wallet that can only spend what it has cannot
    // double inside one candle at 2×.
    expect(biggest).toBeLessThan(2)
  })
})
