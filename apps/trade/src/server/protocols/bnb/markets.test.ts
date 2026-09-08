import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import fixture from "./markets.fixture.json"
const { get, counts } = vi.hoisted(() => ({
  get: vi.fn(),
  counts: { tokens: 0, gecko: 0, dex: 0, security: 0, kyber: 0 },
}))
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  bnbServiceGet: get,
  bnbRequestCounts: () => counts,
}))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  get.mockReset()
  Object.assign(counts, { tokens: 0, gecko: 0, dex: 0, security: 0, kyber: 0 })
  get.mockImplementation(
    async (
      service: keyof typeof counts,
      _path: string,
      params?: Record<string, string>
    ) => {
      counts[service]++
      if (service === "tokens") return fixture.tokens
      if (service === "gecko") return fixture.pools
      if (service === "dex")
        return _path.includes("/search")
          ? { pairs: fixture.pairs }
          : fixture.pairs
      return {
        code: 1,
        result: {
          [params!.contract_addresses]: {
            is_honeypot: "0",
            buy_tax: "0",
            sell_tax: "0",
          },
        },
      }
    }
  )
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

const cake = fixture.tokens.tokens.find((token) => token.symbol === "CAKE")!

describe("BNB pool markets", () => {
  it("joins by lowercase address, skips unpriced coins and USDT, and renames wrapped BNB", async () => {
    const m = await import("./markets")
    const catalog = await m.fetchBnbMarkets("mainnet")
    expect(catalog.networkLabel).toBe("Mainnet")
    expect(catalog.picker.search).toBe(true)
    expect(
      catalog.rows.find((row) => row.marketId === cake.address.toLowerCase())
    ).toMatchObject({
      symbol: "CAKE",
      sizeDecimals: 18,
      caution: "unverified",
      quoteAsset: "USDT",
      maxLeverage: null,
    })
    expect(catalog.rows.find((row) => row.symbol === "BNB")).toBeDefined()
    expect(catalog.rows.find((row) => row.symbol === "USDT")).toBeUndefined()
    expect(catalog.rows.find((row) => row.symbol === "8PAY v2")).toBeUndefined()
    const twins = catalog.rows.filter((row) => row.symbol === "BTR")
    expect(twins).toHaveLength(2)
    expect(twins[0].key).not.toBe(twins[1].key)
    for (const row of catalog.rows)
      expect(row.key).toBe(`bnb:mainnet:${row.marketId}`)
  })
  it("takes price and statistics only from the most liquid base-token pair", async () => {
    const { bestBnbPairs, bnbMarketRow } = await import("./markets")
    const pair = fixture.pairs.find(
      (p) => p.baseToken.address.toLowerCase() === cake.address.toLowerCase()
    )!
    const winner = {
      ...pair,
      pairAddress: "0x" + "a".repeat(40),
      priceUsd: "9",
      liquidity: { usd: 999999999 },
      priceChange: { h24: -5 },
      volume: { h24: 321 },
    }
    const best = bestBnbPairs([pair, winner]).get(cake.address.toLowerCase())!
    const row = bnbMarketRow(
      cake,
      best,
      true,
      fixture.security.result[
        cake.address.toLowerCase() as keyof typeof fixture.security.result
      ]
    )
    expect(row).toMatchObject({
      price: 9,
      liquidityUsd: 999999999,
      poolAddress: winner.pairAddress,
      change24h: -0.05,
      volume24hUsd: 321,
    })
  })
  // Risk mutations are explicit scenarios applied to saved provider data.
  it.each([
    { is_honeypot: "1", sell_tax: "0" },
    { is_honeypot: "0", sell_tax: "0.100001" },
  ])(
    "a flagged vetted token stays visible and suspicious: %j",
    async (risk) => {
      const { bestBnbPairs, bnbMarketRow } = await import("./markets")
      const pair = bestBnbPairs(fixture.pairs).get(cake.address.toLowerCase())!
      expect(bnbMarketRow(cake, pair, true, risk)?.caution).toBe("suspicious")
      expect(
        bnbMarketRow(cake, pair, true, { is_honeypot: "0", sell_tax: "0.1" })
          ?.caution
      ).toBeNull()
    }
  )
  it("never treats missing risk data or an unvetted token as checked", async () => {
    const { bestBnbPairs, bnbMarketRow } = await import("./markets")
    const pair = bestBnbPairs(fixture.pairs).get(cake.address.toLowerCase())!
    expect(bnbMarketRow(cake, pair, true, null)?.caution).toBe("unverified")
    expect(
      bnbMarketRow(cake, pair, false, { is_honeypot: "0", sell_tax: "0" })
        ?.caution
    ).toBe("unverified")
  })
  it("shares concurrent requests and holds the list for a minute", async () => {
    const m = await import("./markets")
    const [a, b] = await Promise.all([
      m.fetchBnbMarkets("mainnet"),
      m.fetchBnbMarkets("mainnet"),
    ])
    expect(a).toBe(b)
    const requests = get.mock.calls.length
    await m.fetchBnbMarkets("mainnet")
    expect(get).toHaveBeenCalledTimes(requests)
    expect(counts.gecko).toBe(2)
    vi.advanceTimersByTime(60_000)
    counts.gecko = 0
    await m.fetchBnbMarkets("mainnet")
    expect(counts.tokens).toBe(1)
    expect(
      get.mock.calls.filter((c) => c[0] === "gecko").map((c) => c[2].page)
    ).toEqual([1, 2, 3, 4])
    expect(
      get.mock.calls.filter((c) => c[0] === "gecko").every((c) => c[4] === 2)
    ).toBe(true)
  })
  it("keeps a good list after provider failure but refuses stale price reads", async () => {
    const m = await import("./markets")
    await m.fetchBnbMarkets("mainnet")
    await vi.runAllTimersAsync()
    const good = await m.fetchBnbMarkets("mainnet")
    vi.advanceTimersByTime(60_000)
    get.mockRejectedValue(
      new Error("EXCHANGE_BUSY:DexScreener spent its allowance")
    )
    expect(await m.fetchBnbMarkets("mainnet")).toBe(good)
    expect(m.bnbPricesWereRationed()).toBe(true)
    await expect(
      m.fetchBnbPrices("mainnet", [good.rows[0].marketId])
    ).rejects.toThrow("EXCHANGE_BUSY:")
  })
  it("reports the failed service on a cold list", async () => {
    get.mockRejectedValue(new Error("offline"))
    await expect(
      (await import("./markets")).fetchBnbMarkets("mainnet")
    ).rejects.toThrow("MARKETS_UNAVAILABLE:PancakeSwap")
  })
  it("checks found coins immediately, excludes other chains and preserves the session token", async () => {
    const m = await import("./markets")
    await m.fetchBnbMarkets("mainnet")
    const id = "0x" + "b".repeat(40)
    const other = {
      ...fixture.pairs[0],
      baseToken: { address: id, symbol: "CAKE" },
    }
    get.mockImplementation(async (service, _path, params) => {
      if (service === "dex")
        return { pairs: [other, { ...other, chainId: "solana" }] }
      return {
        code: 1,
        result: { [params.contract_addresses]: { is_honeypot: "1" } },
      }
    })
    const rows = await m.searchBnbMarkets("mainnet", id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      marketId: id,
      caution: "suspicious",
      sizeDecimals: null,
    })
    expect(get).toHaveBeenCalledWith(
      "security",
      "/api/v1/token_security/56",
      { contract_addresses: id },
      "order"
    )
  })
  it("rejects malformed payloads and practice networks", async () => {
    const m = await import("./markets")
    expect(() => m.bestBnbPairs({})).toThrow("DexScreener")
    expect(() => m.bestBnbPairs([{ chainId: "bsc" }])).toThrow("DexScreener")
    await expect(m.fetchBnbMarkets("testnet")).rejects.toThrow(
      "BNB_NETWORK_UNSUPPORTED"
    )
  })
})

it("prices at most thirty addresses per request and rotates all ten pool pages", async () => {
  const original = get.getMockImplementation()!
  get.mockImplementation(async (service, path, params, ...rest) => {
    if (service === "tokens")
      return {
        tokens: [
          ...fixture.tokens.tokens,
          ...Array.from({ length: 90 }, (_, i) => ({
            address: `0x${(i + 100).toString(16).padStart(40, "0")}`,
            symbol: `TOKEN${i}`,
            chainId: 56,
            decimals: 18,
          })),
        ],
      }
    return original(service, path, params, ...rest)
  })
  const m = await import("./markets")
  for (let minute = 0; minute < 6; minute++) {
    await m.fetchBnbMarkets("mainnet")
    await vi.advanceTimersByTimeAsync(60_000)
    counts.gecko = 0
    counts.dex = 0
    counts.security = 0
  }
  const pages = get.mock.calls
    .filter((c) => c[0] === "gecko")
    .map((c) => c[2].page)
  expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2])
  const priceCalls = get.mock.calls.filter((c) => c[0] === "dex")
  expect(priceCalls.length).toBeGreaterThanOrEqual(24)
  expect(
    priceCalls.every((c) => c[1].split("/").at(-1).split(",").length <= 30)
  ).toBe(true)
})

it("scans risk in the background without blocking the list and spaces checks", async () => {
  const m = await import("./markets")
  const catalog = await m.fetchBnbMarkets("mainnet")
  expect(catalog.rows.length).toBeGreaterThan(0)
  expect(counts.security).toBe(1)
  await vi.advanceTimersByTimeAsync(2099)
  expect(counts.security).toBe(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(counts.security).toBe(2)
})

it("an omitted audit result does not renew an expired clean check", async () => {
  const m = await import("./markets")
  await m.fetchBnbMarkets("mainnet")
  await vi.runAllTimersAsync()
  expect(
    (await m.fetchBnbMarkets("mainnet")).rows.find(
      (r) => r.marketId === cake.address.toLowerCase()
    )?.caution
  ).toBeNull()
  await vi.advanceTimersByTimeAsync(3_600_000)
  counts.gecko = 0
  counts.security = 0
  const original = get.getMockImplementation()!
  get.mockImplementation(async (service, ...args) =>
    service === "security"
      ? { code: 1, result: {} }
      : original(service, ...args)
  )
  await m.fetchBnbMarkets("mainnet")
  await vi.runAllTimersAsync()
  expect(
    (await m.fetchBnbMarkets("mainnet")).rows.find(
      (r) => r.marketId === cake.address.toLowerCase()
    )?.caution
  ).toBe("unverified")
})

describe("BNB current prices", () => {
  it("rejects the whole price read when one page fails", async () => {
    const { fetchBnbPrices } = await import("./markets")
    const ids = Array.from(
      { length: 31 },
      (_, i) => `0x${i.toString(16).padStart(40, "0")}`
    )
    get.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("offline"))
    await expect(fetchBnbPrices("mainnet", ids)).rejects.toThrow(
      "EXCHANGE_BUSY"
    )
  })
  it("keeps the screen and catalogue requests within the Dex allowance", async () => {
    const { BNB_PRICE_REFRESH, BNB_PRICE_PAGE_SIZE, fetchBnbMarkets } =
      await import("./markets")
    const { BNB_DEX_REQUESTS_PER_MINUTE } = await import("./client")
    expect(BNB_PRICE_REFRESH).toEqual({ everyMs: 10_000, mostMarkets: 300 })
    const refreshCalls = Math.ceil(
      BNB_PRICE_REFRESH.mostMarkets / BNB_PRICE_PAGE_SIZE
    )
    expect(refreshCalls).toBe(10)
    expect(
      refreshCalls * (60_000 / BNB_PRICE_REFRESH.everyMs) + 33
    ).toBeLessThan(BNB_DEX_REQUESTS_PER_MINUTE)
    expect((await fetchBnbMarkets("mainnet")).priceRefresh).toEqual(
      BNB_PRICE_REFRESH
    )
  })

  it("reads current pairs without loading the catalogue and shares two-second reads", async () => {
    const { fetchBnbPrices } = await import("./markets")
    const id = cake.address.toLowerCase()
    const [a, b] = await Promise.all([
      fetchBnbPrices("mainnet", [id, id]),
      fetchBnbPrices("mainnet", [cake.address]),
    ])
    expect(a.get(id)).toBeGreaterThan(0)
    expect(b).toEqual(a)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toBe("dex")
    vi.advanceTimersByTime(1999)
    await fetchBnbPrices("mainnet", [id])
    expect(get).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    get.mockResolvedValue(
      fixture.pairs.map((pair) => ({ ...pair, priceUsd: "42" }))
    )
    expect((await fetchBnbPrices("mainnet", [id])).get(id)).toBe(42)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("pages thirty addresses, shares reordered requests, and excludes unsolicited prices", async () => {
    const { fetchBnbPrices } = await import("./markets")
    const ids = Array.from(
      { length: 61 },
      (_, i) => `0x${i.toString(16).padStart(40, "0")}`
    )
    expect(await fetchBnbPrices("mainnet", ids)).toEqual(new Map())
    await fetchBnbPrices("mainnet", [...ids].reverse())
    expect(
      get.mock.calls.map((call) => call[1].split("/").at(-1).split(",").length)
    ).toEqual([30, 30, 1])
  })

  it("does not reuse failed requests or return an old catalogue price", async () => {
    const { fetchBnbPrices, bnbPricesWereRationed } = await import("./markets")
    get.mockRejectedValueOnce(new Error("offline"))
    await expect(fetchBnbPrices("mainnet", [cake.address])).rejects.toThrow(
      "EXCHANGE_BUSY"
    )
    expect(bnbPricesWereRationed()).toBe(true)
    expect((await fetchBnbPrices("mainnet", [cake.address])).size).toBe(1)
    expect(bnbPricesWereRationed()).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("rejects invalid addresses and networks before making requests", async () => {
    const { fetchBnbPrices } = await import("./markets")
    await expect(fetchBnbPrices("testnet", [cake.address])).rejects.toThrow(
      "BNB_NETWORK_UNSUPPORTED"
    )
    await expect(fetchBnbPrices("mainnet", ["../search"])).rejects.toThrow()
    expect(await fetchBnbPrices("mainnet", [])).toEqual(new Map())
    expect(get).not.toHaveBeenCalled()
  })
})

it("initializes the holdings catalogue when cold and includes picker finds before the next refresh", async () => {
  const m = await import("./markets")
  const cold = await m.bnbAccountMarkets()
  expect(cold.ids).toContain(cake.address.toLowerCase())
  expect(cold.prices.get(cake.address.toLowerCase())).toBeGreaterThan(0)
  const originalCalls = get.mock.calls.length
  await m.bnbAccountMarkets()
  expect(get.mock.calls.length).toBe(originalCalls)
  const id = "0x1111111111111111111111111111111111111111"
  const pair = {
    ...fixture.pairs[0],
    baseToken: { address: id, symbol: "NEW" },
  }
  const original = get.getMockImplementation()!
  get.mockImplementation((service, path, ...args) =>
    path.includes("/search")
      ? { pairs: [pair] }
      : original(service, path, ...args)
  )
  expect(await m.searchBnbMarkets("mainnet", id)).toHaveLength(1)
  expect((await m.bnbAccountMarkets()).ids).toContain(id)
})
