import { describe, expect, it } from "vitest"

import { toAsterAccountSnapshot } from "@/server/protocols/aster/account"

describe("the Aster account", () => {
  it("reads Aster's account totals and open positions", () => {
    const snapshot = toAsterAccountSnapshot({
      account: {
        totalWalletBalance: "1000",
        totalMarginBalance: "1025",
        totalUnrealizedProfit: "25",
        availableBalance: "700",
        positions: [
          {
            symbol: "BTCUSDT",
            positionSide: "BOTH",
            positionInitialMargin: "280",
          },
        ],
      },
      positions: [
        {
          symbol: "BTCUSDT",
          positionAmt: "0.2",
          entryPrice: "70000",
          leverage: "10",
          marginType: "isolated",
          positionSide: "BOTH",
          isolatedMargin: "280",
          liquidationPrice: "64000",
          unRealizedProfit: "25",
        },
      ],
    })
    expect(snapshot.figures).toEqual({
      equity: 1_025,
      free: 700,
      inTrades: 325,
      openProfit: 25,
    })
    expect(snapshot.portfolio.positions[0]).toEqual(
      expect.objectContaining({
        marketId: "BTCUSDT",
        szi: 0.2,
        entryPx: 70_000,
        leverage: 10,
        marginUsed: 280,
        liquidationPx: 64_000,
      })
    )
  })

  it("handles an empty account", () => {
    const snapshot = toAsterAccountSnapshot({
      account: {
        totalWalletBalance: "0",
        totalMarginBalance: "0",
        totalUnrealizedProfit: "0",
        availableBalance: "0",
        positions: [],
      },
      positions: [],
    })
    expect(snapshot.figures).toEqual({
      equity: 0,
      free: 0,
      inTrades: 0,
      openProfit: 0,
    })
    expect(snapshot.portfolio.positions).toEqual([])
  })

  it("leaves a missing liquidation price blank", () => {
    const snapshot = toAsterAccountSnapshot({
      account: {
        totalWalletBalance: "10",
        totalMarginBalance: "10",
        totalUnrealizedProfit: "0",
        availableBalance: "2",
        positions: [
          {
            symbol: "ETHUSDT",
            positionSide: "BOTH",
            positionInitialMargin: "8",
          },
        ],
      },
      positions: [
        {
          symbol: "ETHUSDT",
          positionAmt: "-1",
          entryPrice: "2500",
          leverage: "5",
          marginType: "isolated",
          positionSide: "BOTH",
          isolatedMargin: "8",
          liquidationPrice: "0",
        },
      ],
    })
    expect(snapshot.portfolio.positions[0].liquidationPx).toBeNull()
    expect(snapshot.portfolio.positions[0].szi).toBe(-1)
  })

  it("uses Aster's account total when the funded asset is not USDT", () => {
    const snapshot = toAsterAccountSnapshot({
      account: {
        totalWalletBalance: "125.50",
        totalMarginBalance: "125.50",
        totalUnrealizedProfit: "0",
        availableBalance: "125.50",
        positions: [],
        assets: [
          { asset: "USDT", walletBalance: "0" },
          { asset: "USD1", walletBalance: "125.50" },
        ],
      },
      positions: [],
    })

    expect(snapshot.figures).toEqual({
      equity: 125.5,
      free: 125.5,
      inTrades: 0,
      openProfit: 0,
    })
  })

  it("refuses a snapshot instead of hiding an unreadable position", () => {
    expect(() =>
      toAsterAccountSnapshot({
        account: {
          totalMarginBalance: "100",
          totalUnrealizedProfit: "0",
          availableBalance: "50",
          positions: [],
        },
        positions: [
          {
            symbol: "BTCUSDT",
            positionAmt: "0.1",
            entryPrice: "70000",
            leverage: "10",
            marginType: "isolated",
            positionSide: "BOTH",
          },
        ],
      })
    ).toThrow("ASTER_ACCOUNT_UNREADABLE")
  })

  it("uses Aster's stated margin for a cross position", () => {
    const snapshot = toAsterAccountSnapshot({
      account: {
        totalMarginBalance: "100",
        totalUnrealizedProfit: "0",
        availableBalance: "80",
        positions: [
          {
            symbol: "BTCUSDT",
            positionSide: "BOTH",
            positionInitialMargin: "20",
          },
        ],
      },
      positions: [
        {
          symbol: "BTCUSDT",
          positionAmt: "0.01",
          entryPrice: "70000",
          leverage: "10",
          marginType: "cross",
          positionSide: "BOTH",
          isolatedMargin: "0",
          liquidationPrice: "0",
        },
      ],
    })

    expect(snapshot.portfolio.positions[0].marginUsed).toBe(20)
  })
})
