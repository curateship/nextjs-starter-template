import { describe, expect, it } from "vitest"

import { tradeDashboardProtocol } from "@/server/protocols/registry"

describe("the Trade dashboard protocol", () => {
  it("belongs to Hyperliquid mainnet by default", () => {
    const protocol = tradeDashboardProtocol()

    expect(protocol.id).toBe("hyperliquid")
    expect(protocol.defaultNetwork).toBe("mainnet")
  })
})
