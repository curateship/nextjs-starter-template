import { describe, expect, it } from "vitest"
import { BNB_BINANCE_HISTORY, bnbBorrowedCoin } from "./history"
import fixture from "./history.fixture.json"
import { historySourceFor } from "../history-source"

describe("BNB borrowed history", () => {
  it("borrows by contract address and refuses impostors and practice networks", () => {
    const cake = "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82"
    expect(historySourceFor(`bnb:mainnet:${cake}`)).toBe("binance:mainnet:CAKE")
    expect(bnbBorrowedCoin(cake.toUpperCase())).toBe("CAKE")
    expect(historySourceFor(`bnb:testnet:${cake}`)).toBeNull()
    expect(historySourceFor(`bnb:mainnet:0x${"1".repeat(40)}`)).toBeNull()
    expect(bnbBorrowedCoin("CAKE")).toBeNull()
  })
  it("pins only coins passing all four checks in the saved provider evidence", () => {
    expect(Object.keys(BNB_BINANCE_HISTORY).length).toBeGreaterThan(2)
    for (const [address, coin] of Object.entries(BNB_BINANCE_HISTORY)) {
      const vetted = fixture.vetted.filter((t) => t.symbol === coin)
      expect([...new Set(vetted.map((t) => t.address))], coin).toEqual([
        address,
      ])
      expect(fixture.binanceCoins, coin).toContain(coin)
      expect(
        fixture.qualified.find((t) => t.address === address)?.liquidityUsd,
        coin
      ).toBeGreaterThan(200_000)
      expect(historySourceFor(`bnb:mainnet:${address}`)).toBe(
        `binance:mainnet:${coin}`
      )
    }
  })
  it("does not borrow for ambiguous vetted tickers", () => {
    const duplicates = fixture.vetted.filter((t) => t.symbol === "BTR")
    expect(new Set(duplicates.map((t) => t.address)).size).toBeGreaterThan(1)
    for (const token of duplicates)
      expect(bnbBorrowedCoin(token.address)).toBeNull()
  })
})
