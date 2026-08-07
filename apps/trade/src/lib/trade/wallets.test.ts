import { describe, expect, it } from "vitest"

import {
  isAgentKey,
  isWalletAddress,
  paperFigures,
  shortenAddress,
  summarizeWallet,
  venueLabel,
} from "@/lib/trade/wallets"

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"

describe("the five account rows", () => {
  it("splits the journey into settled and still-open money", () => {
    const summary = summarizeWallet(
      { id: "w1", startingBalance: 10_000 },
      { equity: 10_500, free: 9_000, inTrades: 1_500, openProfit: 300 }
    )
    if (summary.state !== "ok") throw new Error("expected figures")
    expect(summary.sinceStart).toBe(500)
    expect(summary.settled).toBe(200)
  })

  it("always adds back up: settled plus open profit is the whole journey", () => {
    const cases = [
      { equity: 9_400, openProfit: -250 },
      { equity: 10_000, openProfit: 0 },
      { equity: 12_345.67, openProfit: 890.12 },
    ]
    for (const figures of cases) {
      const summary = summarizeWallet(
        { id: "w1", startingBalance: 10_000 },
        { ...figures, free: 0, inTrades: 0 }
      )
      if (summary.state !== "ok") throw new Error("expected figures")
      expect(summary.settled + summary.openProfit).toBeCloseTo(
        summary.sinceStart,
        10
      )
    }
  })

  it("says a fresh practice wallet is exactly its starting cash, all free", () => {
    expect(paperFigures({ startingBalance: 5_000 })).toEqual({
      equity: 5_000,
      free: 5_000,
      inTrades: 0,
      openProfit: 0,
    })
  })
})

describe("what counts as an address and a key", () => {
  it("accepts a real address and refuses the rest", () => {
    expect(isWalletAddress(ADDRESS)).toBe(true)
    expect(isWalletAddress(ADDRESS.slice(0, -1))).toBe(false)
    expect(isWalletAddress(`${ADDRESS}0`)).toBe(false)
    expect(isWalletAddress(ADDRESS.replace("0x", ""))).toBe(false)
    expect(isWalletAddress(ADDRESS.replace("1", "g"))).toBe(false)
  })

  it("accepts a key with or without its 0x", () => {
    const key = "a".repeat(64)
    expect(isAgentKey(key)).toBe(true)
    expect(isAgentKey(`0x${key}`)).toBe(true)
    expect(isAgentKey(key.slice(0, -1))).toBe(false)
    expect(isAgentKey(`${key}zz`)).toBe(false)
  })
})

describe("how wallets are labelled", () => {
  it("shows enough of each end of an address to recognise it", () => {
    expect(shortenAddress(ADDRESS)).toBe("0x1234…5678")
    expect(shortenAddress("0xshort")).toBe("0xshort")
  })

  it("names the venue, and says so out loud on testnet", () => {
    expect(venueLabel("hyperliquid", "mainnet")).toBe("Hyperliquid")
    expect(venueLabel("hyperliquid", "testnet")).toBe("Hyperliquid Testnet")
  })
})
