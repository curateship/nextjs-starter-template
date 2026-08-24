import { describe, expect, it } from "vitest"

import {
  liquidationAwayOf,
  marginOf,
  walletMarginHealth,
} from "@/lib/trade/margin-health"
import type { TradePosition } from "@/lib/trade/paper"

function position(
  values: Partial<TradePosition> & Pick<TradePosition, "id" | "marketKey">
): TradePosition {
  return {
    walletId: "wallet-one",
    szi: 2,
    entryPx: 100,
    leverage: 5,
    maxLeverage: 10,
    targets: [],
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
    ...values,
  }
}

describe("wallet margin health", () => {
  it("uses exchange figures for live positions", () => {
    const live = position({
      id: "live",
      marketKey: "hyperliquid:mainnet:ETH",
      live: {
        marginUsed: 75,
        liquidationPx: 80,
        tpOrderId: null,
        slOrderId: null,
      },
    })

    expect(marginOf(live)).toBe(75)
    expect(liquidationAwayOf(live, 100)).toBeCloseTo(0.2)
  })

  it("adds one wallet's margin and finds its nearest liquidation percentage", () => {
    const btc = position({
      id: "btc",
      marketKey: "hyperliquid:mainnet:BTC",
      szi: 1,
      entryPx: 200,
      leverage: 2,
    })
    const eth = position({
      id: "eth",
      marketKey: "hyperliquid:mainnet:ETH",
      szi: 1,
      entryPx: 100,
      leverage: 5,
    })
    const otherWallet = position({
      id: "other",
      walletId: "wallet-two",
      marketKey: "hyperliquid:mainnet:SOL",
    })

    const health = walletMarginHealth(
      [btc, eth, otherWallet],
      new Map([
        [btc.marketKey, 200],
        [eth.marketKey, 100],
      ]),
      new Map(),
      "wallet-one"
    )

    expect(health?.marginUsed).toBe(120)
    expect(health?.nearest?.marketKey).toBe(eth.marketKey)
    expect(health?.nearest?.away).toBeCloseTo(0.15)
  })

  it("returns no health for an empty wallet", () => {
    expect(
      walletMarginHealth([], new Map(), new Map(), "wallet-one")
    ).toBeNull()
  })

  it("uses the loaded market price before the live feed's first tick", () => {
    const eth = position({
      id: "eth",
      marketKey: "hyperliquid:mainnet:ETH",
      entryPx: 80,
      live: {
        marginUsed: 20,
        liquidationPx: 75,
        tpOrderId: null,
        slOrderId: null,
      },
    })

    const health = walletMarginHealth(
      [eth],
      new Map(),
      new Map([[eth.marketKey, 100]]),
      "wallet-one"
    )

    expect(health?.nearest?.away).toBeCloseTo(0.25)
  })
})
