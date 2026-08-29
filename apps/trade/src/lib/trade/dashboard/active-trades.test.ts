import { describe, expect, it } from "vitest"

import {
  mergeActiveTradesSnapshot,
  summarizeActiveTrades,
} from "@/lib/trade/dashboard/active-trades"
import type {
  ActiveTradesSnapshot,
  TradingOverviewActiveTrade,
} from "@/lib/trade/dashboard/overview"

function trade(
  id: string,
  walletId: string,
  value: number | null,
  profit: number | null
): TradingOverviewActiveTrade {
  return {
    id,
    walletId,
    walletLabel: walletId,
    accountType: "Real",
    protocol: "Hyperliquid",
    marketKey: `hyperliquid:mainnet:${id}`,
    market: id,
    side: "long",
    value,
    profit,
    profitShare: profit === null || value === null ? null : profit / value,
  }
}

describe("active-trade totals", () => {
  it("adds the value and profit of every shown trade", () => {
    expect(
      summarizeActiveTrades([
        trade("BTC", "main", 3_000, -40),
        trade("ETH", "practice", 245, 6),
      ])
    ).toEqual({ totalValue: 3_245, totalProfit: -34 })
  })

  it("does not present a partial total when a trade has no current price", () => {
    expect(
      summarizeActiveTrades([
        trade("BTC", "main", 3_000, -40),
        trade("ETH", "practice", null, null),
      ])
    ).toEqual({ totalValue: null, totalProfit: null })
  })
})

describe("active-trade header refreshes", () => {
  it("keeps the last known row for a wallet that did not answer", () => {
    const was: ActiveTradesSnapshot = {
      readAt: 100,
      activeTrades: [
        trade("BTC", "main", 3_000, -40),
        trade("ETH", "practice", 245, 6),
      ],
      activeTradesUnavailable: [],
    }
    const fresh: ActiveTradesSnapshot = {
      readAt: 200,
      activeTrades: [trade("ETH", "practice", 250, 8)],
      activeTradesUnavailable: ["main"],
    }

    expect(mergeActiveTradesSnapshot(was, fresh)).toEqual({
      ...fresh,
      readAt: 100,
      activeTrades: [
        trade("ETH", "practice", 250, 8),
        trade("BTC", "main", 3_000, -40),
      ],
    })
  })
})
