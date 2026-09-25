import { describe, expect, it } from "vitest"

import {
  marketKeyOnDashboard,
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

  it("knows which dashboard a saved market belongs to", () => {
    expect(
      marketKeyOnDashboard("hyperliquid:mainnet:BTC", "hyperliquid", "mainnet")
    ).toBe(true)
    expect(
      marketKeyOnDashboard("hyperliquid:mainnet:BTC", "hyperliquid", "testnet")
    ).toBe(false)
    // The memory is shared across dashboards, so another exchange's coin must
    // read as "nothing remembered here", never as a missing market.
    expect(
      marketKeyOnDashboard("hyperliquid:mainnet:BTC", "phemex", "mainnet")
    ).toBe(false)
    expect(marketKeyOnDashboard("junk", "hyperliquid", "mainnet")).toBe(false)
  })
})
