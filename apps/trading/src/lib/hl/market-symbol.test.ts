import { describe, expect, it } from "vitest"

import {
  HYPERLIQUID_MARKET_NAME_MAX_LENGTH,
  hyperliquidMarketSchema,
} from "@/lib/hl/market-symbol"

describe("hyperliquidMarketSchema", () => {
  it("accepts long builder-deployed market names", () => {
    expect(
      hyperliquidMarketSchema.parse("hbtwo:tndex:A B:C/../../../../../../../中")
    ).toBe("hbtwo:tndex:A B:C/../../../../../../../中")
  })

  it("keeps a bounded market name", () => {
    expect(() =>
      hyperliquidMarketSchema.parse(
        "x".repeat(HYPERLIQUID_MARKET_NAME_MAX_LENGTH + 1)
      )
    ).toThrow()
  })

  it("rejects control characters", () => {
    expect(() => hyperliquidMarketSchema.parse("xyz:TSLA\nBTC")).toThrow()
  })
})
