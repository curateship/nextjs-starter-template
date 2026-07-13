import { describe, expect, it } from "vitest"

import { resolveTradingNetwork } from "@/lib/hl/network"

describe("resolveTradingNetwork", () => {
  it("uses the selected wallet network instead of the app default", () => {
    expect(resolveTradingNetwork("mainnet", "testnet")).toBe("testnet")
    expect(resolveTradingNetwork("testnet", "mainnet")).toBe("mainnet")
  })

  it("uses the app default when no exchange wallet is selected", () => {
    expect(resolveTradingNetwork("mainnet", null)).toBe("mainnet")
  })
})
