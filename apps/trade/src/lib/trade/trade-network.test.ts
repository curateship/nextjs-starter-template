import { describe, expect, it } from "vitest"

import {
  marketKeyOnNetwork,
  resolveTradeNetwork,
} from "@/lib/trade/trade-network"

describe("which network the page is on", () => {
  it("defaults to mainnet", () => {
    expect(resolveTradeNetwork(undefined, undefined)).toBe("mainnet")
  })

  it("follows the picker when nothing is charted", () => {
    expect(resolveTradeNetwork(undefined, "testnet")).toBe("testnet")
    expect(resolveTradeNetwork(undefined, "mainnet")).toBe("mainnet")
  })

  it("lets the market win — a link to a testnet market IS testnet", () => {
    expect(
      resolveTradeNetwork("hyperliquid:testnet:BTC", undefined)
    ).toBe("testnet")
    expect(
      resolveTradeNetwork("hyperliquid:testnet:BTC", "mainnet")
    ).toBe("testnet")
    expect(
      resolveTradeNetwork("hyperliquid:mainnet:BTC", "testnet")
    ).toBe("mainnet")
  })

  it("ignores junk — a bad key or a bad choice lands on mainnet", () => {
    expect(resolveTradeNetwork("not-a-key", undefined)).toBe("mainnet")
    expect(resolveTradeNetwork(undefined, "moonnet")).toBe("mainnet")
  })

  it("knows which network a saved market belongs to", () => {
    expect(marketKeyOnNetwork("hyperliquid:mainnet:BTC", "mainnet")).toBe(true)
    expect(marketKeyOnNetwork("hyperliquid:mainnet:BTC", "testnet")).toBe(false)
    expect(marketKeyOnNetwork("junk", "mainnet")).toBe(false)
  })
})
