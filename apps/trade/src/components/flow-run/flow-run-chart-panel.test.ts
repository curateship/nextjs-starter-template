import { describe, expect, it } from "vitest"

import { defaultTradeGridSettings } from "@/lib/automations/nodes/trade-grid"
import type { CandleBar } from "@/lib/protocols/contracts"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import { flowRunIndicatorPaint } from "@/lib/trade/flow-run-indicators"

const BAR = 4 * 60 * 60 * 1_000

function gridSpec(): TradeFlowRunSpec {
  const settings = defaultTradeGridSettings()
  settings.emaPeriod = 50
  return {
    protocol: "hyperliquid",
    network: "mainnet",
    folderId: null,
    marketKeys: ["hyperliquid:mainnet:BTC"],
    strategy: { kind: "emaGrid", settings, interval: "4h" },
    capUsd: 10_000,
    walletLabel: "Practice",
    real: false,
  }
}

describe("the indicator on a Grid flow's run chart", () => {
  it("draws the frozen EMA period without crossover arrows", () => {
    const bars: CandleBar[] = Array.from({ length: 100 }, (_, index) => ({
      openTime: index * BAR,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 1,
    }))

    const paint = flowRunIndicatorPaint(gridSpec(), bars)

    expect(paint.lines.map((line) => line.id)).toEqual(["ema-50"])
    expect(paint.marks).toEqual([])
  })
})
