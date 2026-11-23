import { describe, expect, it } from "vitest"

import {
  toBinanceAccountSnapshot,
  toBinanceLeverageCeilings,
} from "@/server/protocols/binance/account"

const account = {
  totalMarginBalance: "1000",
  totalUnrealizedProfit: "12.5",
  availableBalance: "800",
  positions: [{ symbol: "BTCUSDT", positionSide: "BOTH", initialMargin: "20" }],
}

function position(overrides: Record<string, unknown>) {
  return {
    symbol: "BTCUSDT",
    positionAmt: "0.002",
    entryPrice: "50000",
    leverage: "5",
    marginType: "cross",
    positionSide: "BOTH",
    isolatedMargin: "0",
    liquidationPrice: "0",
    unRealizedProfit: "2",
    ...overrides,
  }
}

describe("Binance account", () => {
  it("reads the balance, and each position's margin from its own mode", () => {
    const snapshot = toBinanceAccountSnapshot({
      account,
      positions: [
        position({}),
        position({ symbol: "1000PEPEUSDT", positionAmt: "-500", marginType: "isolated", isolatedMargin: "7.5", liquidationPrice: "0.02" }),
        position({ symbol: "ETHUSDT", positionAmt: "0" }),
      ],
    })
    expect(snapshot.figures).toEqual({ equity: 1000, free: 800, inTrades: 200, openProfit: 12.5 })
    expect(snapshot.portfolio.positions).toEqual([
      expect.objectContaining({ marketId: "BTC", szi: 0.002, marginUsed: 20, marginMode: "cross", liquidationPx: null }),
      expect.objectContaining({ marketId: "kPEPE", szi: -500, marginUsed: 7.5, marginMode: "isolated", liquidationPx: 0.02 }),
    ])
  })

  it("refuses an account in Hedge Mode in words", () => {
    expect(() =>
      toBinanceAccountSnapshot({ account, positions: [position({ positionSide: "LONG" })] })
    ).toThrow(/^WALLET_POSITION_MODE:.*One-way Mode/)
  })

  it("takes each market's highest leverage from its brackets", () => {
    expect(
      toBinanceLeverageCeilings([
        { symbol: "BTCUSDT", brackets: [{ initialLeverage: 125 }, { initialLeverage: 100 }] },
        { symbol: "1000PEPEUSDT", brackets: [{ initialLeverage: "50" }] },
        { symbol: "ODDUSDT", brackets: [] },
      ])
    ).toEqual(new Map([["BTC", 125], ["kPEPE", 50]]))
  })
})
