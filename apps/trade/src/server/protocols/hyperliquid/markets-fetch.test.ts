import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sdk = vi.hoisted(() => ({
  allPerpMetas: vi.fn(),
  close: vi.fn(),
  perpCategories: vi.fn(),
  perpDexs: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock("@nktkas/hyperliquid", () => ({
  HttpTransport: class {},
  InfoClient: class {
    allPerpMetas = sdk.allPerpMetas
    perpCategories = sdk.perpCategories
    perpDexs = sdk.perpDexs
  },
  WebSocketTransport: class {
    close = sdk.close
  },
  SubscriptionClient: class {
    allDexsAssetCtxs = sdk.subscribe
  },
}))

import { allAssetCtxsSnapshot } from "@/server/protocols/hyperliquid/client"
import { fetchHyperliquidMarkets } from "@/server/protocols/hyperliquid/markets"

const ctx = {
  markPx: "100",
  prevDayPx: "90",
  dayNtlVlm: "1000000",
  funding: "0.0001",
  openInterest: "500",
}

describe("fetching Hyperliquid markets", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdk.perpDexs.mockResolvedValue([
      null,
      { name: "xyz", fullName: "XYZ Markets" },
    ])
    sdk.allPerpMetas.mockResolvedValue([
      { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40 }] },
      { universe: [{ name: "xyz:AAPL", szDecimals: 2, maxLeverage: 10 }] },
    ])
    sdk.perpCategories.mockResolvedValue([
      ["BTC", "crypto"],
      ["xyz:AAPL", "stocks"],
    ])
    sdk.unsubscribe.mockResolvedValue(undefined)
    sdk.subscribe.mockImplementation(
      async (listener: (event: unknown) => void) => {
        listener({
          ctxs: [
            ["", [ctx]],
            ["xyz", [ctx]],
          ],
        })
        return { unsubscribe: sdk.unsubscribe }
      }
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("gets every venue's figures from one websocket snapshot", async () => {
    const catalog = await fetchHyperliquidMarkets("mainnet")

    expect(catalog.rows.map((row) => row.marketId)).toEqual(["BTC", "xyz:AAPL"])
    expect(sdk.allPerpMetas).toHaveBeenCalledTimes(1)
    expect(sdk.subscribe).toHaveBeenCalledTimes(1)
    expect(sdk.unsubscribe).toHaveBeenCalledTimes(1)
    expect(sdk.close).toHaveBeenCalledTimes(1)
  })

  it("closes a subscription that does not open before the deadline", async () => {
    vi.useFakeTimers()
    sdk.subscribe.mockReturnValue(new Promise(() => {}))

    const pending = allAssetCtxsSnapshot("testnet")
    const result = expect(pending).rejects.toThrow("snapshot timed out")
    await vi.advanceTimersByTimeAsync(10_000)

    await result
    expect(sdk.close).toHaveBeenCalledTimes(1)
  })
})
