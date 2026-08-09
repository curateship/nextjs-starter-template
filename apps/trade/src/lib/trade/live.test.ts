import { describe, expect, it } from "vitest"

import type { WalletPortfolio } from "@/lib/protocols/contracts"
import { keyExpiryWarning, livePortfolioRows } from "@/lib/trade/live"

const WALLET = {
  id: "w1",
  protocol: "hyperliquid" as const,
  network: "mainnet" as const,
}

const PORTFOLIO: WalletPortfolio = {
  positions: [
    {
      marketId: "BTC",
      szi: 0.5,
      entryPx: 100_000,
      leverage: 5,
      marginUsed: 10_000,
      liquidationPx: 81_000,
      tpPx: 120_000,
      slPx: 90_000,
      tpOrderId: "11",
      slOrderId: "12",
    },
  ],
  orders: [
    {
      orderId: "13",
      marketId: "ETH",
      side: "buy",
      px: 3_000,
      sz: 2,
      reduceOnly: false,
      trigger: false,
    },
  ],
}

describe("live rows for the screens", () => {
  it("keys rows to the wallet's own network and carries the exchange's figures", () => {
    const rows = livePortfolioRows(WALLET, PORTFOLIO, 1_000)

    expect(rows.positions).toHaveLength(1)
    const position = rows.positions[0]
    expect(position.marketKey).toBe("hyperliquid:mainnet:BTC")
    expect(position.id).toBe("live:w1:BTC")
    expect(position.walletId).toBe("w1")
    expect(position.live).toEqual({
      marginUsed: 10_000,
      liquidationPx: 81_000,
      tpOrderId: "11",
      slOrderId: "12",
    })
    expect(position.tpPx).toBe(120_000)

    expect(rows.orders).toHaveLength(1)
    expect(rows.orders[0].id).toBe("13")
    expect(rows.orders[0].marketKey).toBe("hyperliquid:mainnet:ETH")
    expect(rows.orders[0].live).toBe(true)
  })

  it("gives a testnet wallet testnet market keys — the two can never mix", () => {
    const rows = livePortfolioRows(
      { ...WALLET, network: "testnet" },
      PORTFOLIO,
      1_000
    )
    expect(rows.positions[0].marketKey).toBe("hyperliquid:testnet:BTC")
  })
})

describe("the key-expiry warning", () => {
  const DAY = 86_400_000
  const now = 1_700_000_000_000

  it("says nothing while there is nothing to say", () => {
    expect(keyExpiryWarning(null, now)).toBeNull()
    expect(keyExpiryWarning(now + 15 * DAY, now)).toBeNull()
  })

  it("warns inside two weeks, counting the days", () => {
    expect(keyExpiryWarning(now + 14 * DAY, now)).toContain("14 days")
    expect(keyExpiryWarning(now + DAY / 2, now)).toContain("1 day")
  })

  it("says expired once it is", () => {
    expect(keyExpiryWarning(now - 1, now)).toContain("expired")
  })
})
