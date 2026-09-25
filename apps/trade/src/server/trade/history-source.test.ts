import { describe, expect, it, vi } from "vitest"

import { resolveHistorySource } from "@/server/trade/history-source"

/**
 * The name rule can only say what Binance would call a market. Whether
 * Binance lists it is checked here, against the source's own catalogue, so
 * a Lighter stock Dukascopy does not know is never fetched under a Binance
 * name it never had.
 */
const LISTED: Record<string, Array<{ key: string }>> = {
  binance: [{ key: "binance:mainnet:BTC" }, { key: "binance:mainnet:kPEPE" }],
  dukascopy: [{ key: "dukascopy:mainnet:tslaususd" }],
}

vi.mock("@/server/protocols/market-catalog", () => ({
  loadRawMarketCatalog: async (protocol: string) => ({
    rows: LISTED[protocol] ?? [],
  }),
}))

describe("confirming a source against its own list", () => {
  it("keeps a coin Binance lists", async () => {
    await expect(resolveHistorySource("lighter:mainnet:BTC")).resolves.toBe(
      "binance:mainnet:BTC"
    )
    await expect(resolveHistorySource("lighter:mainnet:1000PEPE")).resolves.toBe(
      "binance:mainnet:kPEPE"
    )
  })

  it("keeps a stock Dukascopy lists", async () => {
    await expect(resolveHistorySource("lighter:mainnet:TSLA")).resolves.toBe(
      "dukascopy:mainnet:tslaususd"
    )
  })

  it("drops a name the source never had", async () => {
    await expect(resolveHistorySource("lighter:mainnet:KIOXIA")).resolves.toBeNull()
    await expect(resolveHistorySource("lighter:mainnet:AAVE/USDC")).resolves.toBeNull()
    await expect(resolveHistorySource("nonsense")).resolves.toBeNull()
  })
})
