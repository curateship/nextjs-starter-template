import { describe, expect, it } from "vitest"

import { appOptions } from "@/app/options"
import { tradeGridNode } from "@/lib/automations/nodes/trade-grid"

describe("the automation canvas backtest panel", () => {
  it("appears for a Grid flow", () => {
    expect(
      appOptions.automations?.canvasPanel?.appliesTo?.([tradeGridNode.kind])
    ).toBe(true)
  })
})
