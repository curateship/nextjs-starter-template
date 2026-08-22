import { afterEach, describe, expect, it, vi } from "vitest"

import { asterPublic } from "@/server/protocols/aster/client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Aster public reads", () => {
  it("uses the network's V3 host and encodes query values", async () => {
    const fetchMock = vi.fn(async (_url: URL) =>
      Response.json({ serverTime: 1 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await asterPublic("testnet", "/fapi/v3/klines", {
      symbol: "BTCUSDT",
      interval: "4h",
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://fapi.asterdex-testnet.com/fapi/v3/klines?symbol=BTCUSDT&interval=4h"
    )
  })

  it("turns a rate refusal into the app's busy answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 }))
    )
    await expect(asterPublic("mainnet", "/fapi/v3/time")).rejects.toThrow(
      "EXCHANGE_BUSY"
    )
  })
})
