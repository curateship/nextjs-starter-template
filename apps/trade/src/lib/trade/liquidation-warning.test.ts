import { describe, expect, it } from "vitest"

import {
  isInsideLiquidationWarning,
  liquidationWarningSchema,
} from "@/lib/trade/liquidation-warning"
import { liquidationDistance, type TradePosition } from "@/lib/trade/paper"

const position: TradePosition = {
  id: "p1",
  walletId: "w1",
  marketKey: "hyperliquid:mainnet:ETH",
  szi: 1,
  entryPx: 100,
  leverage: 5,
  maxLeverage: 20,
  targets: [],
  tpPx: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 0,
}

describe("liquidation warnings", () => {
  it("uses the exchange price for real positions and returns both distances", () => {
    const distance = liquidationDistance(
      {
        ...position,
        live: {
          marginUsed: 20,
          liquidationPx: 82,
          tpOrderId: null,
          slOrderId: null,
        },
      },
      87.1
    )
    expect(distance).toEqual({
      liquidationPx: 82,
      usd: 5.099999999999994,
      fraction: 5.099999999999994 / 87.1,
    })
  })

  it("does not invent a real liquidation price when the exchange omits it", () => {
    expect(
      liquidationDistance(
        {
          ...position,
          live: {
            marginUsed: 20,
            liquidationPx: null,
            tpOrderId: null,
            slOrderId: null,
          },
        },
        87.1
      )
    ).toBeNull()
  })

  it("fires when either saved distance is crossed", () => {
    expect(
      isInsideLiquidationWarning({ usd: 6, fraction: 0.04 }, { usd: 5, pct: 5 })
    ).toBe(true)
    expect(
      isInsideLiquidationWarning({ usd: 6, fraction: 0.06 }, { usd: 5, pct: 5 })
    ).toBe(false)
  })

  it("accepts blanks as null and rejects zero or more than 100 out of 100", () => {
    expect(liquidationWarningSchema.parse({ usd: null, pct: null })).toEqual({
      usd: null,
      pct: null,
    })
    expect(() =>
      liquidationWarningSchema.parse({ usd: 0, pct: null })
    ).toThrow()
    expect(() =>
      liquidationWarningSchema.parse({ usd: null, pct: 101 })
    ).toThrow()
  })
})
