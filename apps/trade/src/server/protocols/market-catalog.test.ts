import { beforeEach, describe, expect, it, vi } from "vitest"

const exchange = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock("@/server/protocols/registry", () => ({
  getProtocol: () => ({ markets: { fetch: exchange.fetch } }),
}))

import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"

describe("the shared raw market catalog", () => {
  beforeEach(() => {
    exchange.fetch.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"))
  })

  it("shares one exchange read for a minute", async () => {
    const catalog = { rows: [{ key: "BTC" }] }
    exchange.fetch.mockResolvedValue(catalog)

    const first = loadRawMarketCatalog("hyperliquid", "mainnet")
    const second = loadRawMarketCatalog("hyperliquid", "mainnet")

    expect(first).toBe(second)
    await expect(first).resolves.toBe(catalog)
    expect(exchange.fetch).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(60_000)
    await loadRawMarketCatalog("hyperliquid", "mainnet")
    expect(exchange.fetch).toHaveBeenCalledTimes(2)
  })

  it("does not remember an exchange refusal", async () => {
    exchange.fetch
      .mockRejectedValueOnce(new Error("exchange away"))
      .mockResolvedValueOnce({ rows: [] })

    await expect(loadRawMarketCatalog("phemex", "mainnet")).rejects.toThrow(
      "exchange away"
    )
    await expect(loadRawMarketCatalog("phemex", "mainnet")).resolves.toEqual({
      rows: [],
    })
    expect(exchange.fetch).toHaveBeenCalledTimes(2)
  })
})
