import { describe, expect, it } from "vitest"

import type { WalletPortfolio } from "@/lib/protocols/contracts"
import {
  keepUnreachableRows,
  keyExpiryWarning,
  livePortfolioRows,
} from "@/lib/trade/live"

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

describe("a wallet the exchange would not answer for", () => {
  const row = (walletId: string, marketKey: string) =>
    ({ walletId, marketKey }) as never

  function answer(over: {
    positions?: unknown[]
    orders?: unknown[]
    unreachable?: string[]
  }) {
    return {
      positions: (over.positions ?? []) as never[],
      orders: (over.orders ?? []) as never[],
      unreachable: over.unreachable ?? [],
    }
  }

  it("keeps what it last held instead of showing nothing", () => {
    // The bug: one failed read emptied the wallet, so a real position blinked
    // out of the table and back again every few seconds.
    const held = answer({ positions: [row("w1", "hyperliquid:mainnet:HYPE")] })
    const failed = answer({ unreachable: ["w1"] })

    const shown = keepUnreachableRows(held, failed)
    expect(shown.positions).toHaveLength(1)
    expect(shown.unreachable).toEqual(["w1"])
  })

  it("lets a read that landed have the last word", () => {
    // The position really was closed while nobody could see it. The next
    // answer that actually arrives is the truth, stale rows and all.
    const held = answer({ positions: [row("w1", "hyperliquid:mainnet:HYPE")] })
    const landed = answer({ positions: [] })

    expect(keepUnreachableRows(held, landed).positions).toEqual([])
  })

  it("only carries the wallet that could not be reached", () => {
    const held = answer({
      positions: [
        row("w1", "hyperliquid:mainnet:HYPE"),
        row("w2", "hyperliquid:mainnet:ZRO"),
      ],
    })
    // w2 answered and holds nothing now; w1 did not answer at all.
    const next = answer({ unreachable: ["w1"] })

    const shown = keepUnreachableRows(held, next)
    expect(shown.positions).toHaveLength(1)
    expect((shown.positions[0] as { walletId: string }).walletId).toBe("w1")
  })

  it("has nothing to carry on the very first read", () => {
    const first = answer({ unreachable: ["w1"] })
    expect(keepUnreachableRows(null, first)).toBe(first)
  })
})
