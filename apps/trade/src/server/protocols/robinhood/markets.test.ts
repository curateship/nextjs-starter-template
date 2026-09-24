import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fixture from "./markets.fixture.json"

const { get, counts } = vi.hoisted(() => ({
  get: vi.fn(),
  counts: { explorer: 0, gecko: 0, dex: 0, security: 0 },
}))
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  robinhoodServiceGet: get,
  robinhoodRequestCounts: () => counts,
}))

// Addresses from the saved answers, measured on 23 Sep 2026.
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"
const BND = "0x2f62fc9fabb470c690f141c28340ed832bb27020"
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
const PONS = "0x39dbed3a2bd333467115de45665cc57f813c4571"
// One of eighteen tokens named "NVIDIA • Robinhood Token" that Robinhood's
// factory did not make. It had 3,195 holders.
const FAKE_NVDA = "0x1076f47f9632d726cf0ff93ad1616c45cbb8b94d"

type Params = Record<string, string> | undefined
function answer(service: string, path: string, params: Params): unknown {
  if (service === "explorer")
    return params?.index ? fixture.factoryPages[1] : fixture.factoryPages[0]
  if (service === "gecko") return fixture.pools
  if (service === "dex")
    return path.includes("/search") ? { pairs: fixture.pairs } : fixture.pairs
  return fixture.security
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  get.mockReset()
  Object.assign(counts, { explorer: 0, gecko: 0, dex: 0, security: 0 })
  get.mockImplementation(
    async (service: keyof typeof counts, path: string, params: Params) => {
      counts[service]++
      return answer(service, path, params)
    }
  )
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe("Robinhood Chain's stock tokens", () => {
  it("reads the factory's deploys and hands back its cursor with nulls spelled out", async () => {
    const { parseStockDeploys } = await import("./markets")
    const first = parseStockDeploys(fixture.factoryPages[0])
    expect(first.stocks.map((stock) => stock.symbol).sort()).toEqual([
      "BND",
      "GLD",
      "GME",
      "META",
      "NVDA",
      "TSLA",
    ])
    expect(first.stocks.find((stock) => stock.address === NVDA)).toEqual({
      address: NVDA,
      symbol: "NVDA",
      decimals: 18,
      logoURI: `https://cdn.robinhood.com/ncw_assets/logos/${NVDA}.png`,
      category: "stocks",
    })
    expect(first.next).toEqual({
      index: "36",
      block_number: "20948804",
      items_count: "50",
    })
    // The last page also holds the factory's own setup and upgrade events.
    const last = parseStockDeploys(fixture.factoryPages[1])
    expect(last.stocks.map((stock) => stock.symbol)).toEqual(["QBTS"])
    expect(last.next).toBeNull()
  })
  it("ignores an event from any address but the factory", async () => {
    const { parseStockDeploys } = await import("./markets")
    const page = structuredClone(fixture.factoryPages[0])
    for (const item of page.items) item.address.hash = FAKE_NVDA
    expect(parseStockDeploys(page).stocks).toEqual([])
  })
})

describe("Robinhood Chain's market list", () => {
  it("puts the factory's stocks under TradFi and pool coins under Crypto", async () => {
    const { fetchRobinhoodMarkets } = await import("./markets")
    const catalog = await fetchRobinhoodMarkets("mainnet")
    expect(catalog).toMatchObject({
      protocol: "robinhood",
      protocolLabel: "Robinhood Chain",
      networkLabel: "Mainnet",
      picker: { categories: "catalog", search: true },
    })
    expect(catalog.rows.find((row) => row.marketId === NVDA)).toMatchObject({
      key: `robinhood:mainnet:${NVDA}`,
      symbol: "NVDA",
      category: "stocks",
      quoteAsset: "USDG",
      price: 225.6,
      sizeDecimals: 18,
      iconUrl: `https://cdn.robinhood.com/ncw_assets/logos/${NVDA}.png`,
      // GoPlus left the honeypot answer blank. That is not a warning.
      caution: null,
    })
    expect(catalog.rows.find((row) => row.marketId === PONS)).toMatchObject({
      category: "crypto",
      caution: "unverified",
    })
    // META's best pair is a Uniswap v4 pool, named by a 64-character id.
    expect(catalog.rows.find((row) => row.symbol === "META")).toMatchObject({
      category: "stocks",
      poolAddress: expect.stringMatching(/^0x[\da-f]{64}$/),
    })
  })
  it("lists wrapped ETH as ETH, and never USDG, native ETH or an unpriced stock", async () => {
    const { fetchRobinhoodMarkets } = await import("./markets")
    const { rows } = await fetchRobinhoodMarkets("mainnet")
    expect(rows.find((row) => row.marketId === WETH)).toMatchObject({
      symbol: "ETH",
      category: "crypto",
      caution: null,
    })
    const ids = rows.map((row) => row.marketId)
    expect(ids).not.toContain(USDG)
    expect(ids).not.toContain(`0x${"0".repeat(40)}`)
    // BND is a real stock token, but DexScreener had no pair for it.
    expect(ids).not.toContain(BND)
    expect(rows.filter((row) => row.category === "stocks")).toHaveLength(6)
  })
  it("treats a coin named like a stock as a coin when the factory did not make it", async () => {
    const { fetchRobinhoodMarkets } = await import("./markets")
    // The saved pool list and prices, with the real NVDA's entries copied onto
    // an impostor's address, as a busy fake would appear.
    const pools = structuredClone(fixture.pools)
    const real = pools.included.find(
      (token) => token.attributes.address === NVDA
    )!
    const fake = structuredClone(real)
    fake.attributes.address = FAKE_NVDA
    pools.included.push(fake)
    const pairs = structuredClone(fixture.pairs)
    const pair = pairs.find((one) => one.baseToken.address.toLowerCase() === NVDA)!
    pairs.push({
      ...pair,
      pairAddress: `0x${"9".repeat(40)}`,
      baseToken: { ...pair.baseToken, address: FAKE_NVDA },
    })
    get.mockImplementation(async (service: string, path: string, params: Params) =>
      service === "gecko"
        ? pools
        : service === "dex"
          ? pairs
          : answer(service, path, params)
    )
    const { rows } = await fetchRobinhoodMarkets("mainnet")
    expect(rows.find((row) => row.marketId === FAKE_NVDA)).toMatchObject({
      symbol: "NVDA",
      category: "crypto",
      caution: "unverified",
    })
    expect(rows.find((row) => row.marketId === NVDA)?.category).toBe("stocks")
  })
  it("reads every factory page once an hour and GeckoTerminal at most twice a minute", async () => {
    const { fetchRobinhoodMarkets } = await import("./markets")
    await fetchRobinhoodMarkets("mainnet")
    const explorerCalls = get.mock.calls.filter((call) => call[0] === "explorer")
    expect(explorerCalls).toHaveLength(2)
    expect(explorerCalls[1][2]).toEqual({
      index: "36",
      block_number: "20948804",
      items_count: "50",
    })
    expect(counts.gecko).toBeLessThanOrEqual(2)
    vi.advanceTimersByTime(60_000)
    await fetchRobinhoodMarkets("mainnet")
    expect(get.mock.calls.filter((call) => call[0] === "explorer")).toHaveLength(2)
  })
  it("stops on a cursor it has already followed", async () => {
    const { fetchRobinhoodMarkets } = await import("./markets")
    get.mockImplementation(async (service: string, path: string, params: Params) =>
      service === "explorer"
        ? fixture.factoryPages[0]
        : answer(service, path, params)
    )
    await fetchRobinhoodMarkets("mainnet")
    expect(get.mock.calls.filter((call) => call[0] === "explorer")).toHaveLength(2)
  })
  it("names Blockscout when a cold list cannot read the factory", async () => {
    const { fetchRobinhoodMarkets } = await import("./markets")
    get.mockImplementation(async (service: string, path: string, params: Params) => {
      if (service === "explorer")
        throw new Error("ROBINHOOD_SERVICE_REFUSED:Blockscout:403")
      return answer(service, path, params)
    })
    await expect(fetchRobinhoodMarkets("mainnet")).rejects.toThrow(
      "MARKETS_UNAVAILABLE:Blockscout could not refresh the Robinhood Chain market list."
    )
    await expect(fetchRobinhoodMarkets("testnet")).rejects.toThrow(
      "ROBINHOOD_NETWORK_UNSUPPORTED"
    )
  })
  it("finds a coin by name through DexScreener's search", async () => {
    const { searchRobinhoodMarkets } = await import("./markets")
    const rows = await searchRobinhoodMarkets("mainnet", "PONS")
    expect(rows.find((row) => row.marketId === PONS)).toMatchObject({
      symbol: "PONS",
      caution: "unverified",
    })
    expect(get).toHaveBeenCalledWith("dex", "/latest/dex/search", { q: "PONS" })
  })
  it("refreshes the screen within half of DexScreener's shared allowance", async () => {
    const { fetchRobinhoodMarkets } = await import("./markets")
    const { PRICE_REFRESH, PRICE_PAGE_SIZE } = await import(
      "@/server/protocols/evm-chain/markets"
    )
    const { ROBINHOOD_DEX_REQUESTS_PER_MINUTE } = await import("./client")
    const catalog = await fetchRobinhoodMarkets("mainnet")
    // Every ten seconds, the 300 busiest markets, thirty to a request.
    expect(catalog.priceRefresh).toEqual({ everyMs: 10_000, mostMarkets: 300 })
    expect(catalog.priceRefresh).toBe(PRICE_REFRESH)
    const perRefresh = Math.ceil(PRICE_REFRESH.mostMarkets / PRICE_PAGE_SIZE)
    expect(perRefresh).toBe(10)
    const screenPerMinute = perRefresh * (60_000 / PRICE_REFRESH.everyMs)
    // The list is rebuilt at most once a minute. Allow for twice today's 204
    // stock tokens, ETH, and both coins of each of the 200 busiest pools.
    const listPerMinute = Math.ceil((2 * 204 + 1 + 2 * 200) / PRICE_PAGE_SIZE)
    // BNB Chain spends the other half, so both screens can be open at once.
    expect(screenPerMinute + listPerMinute).toBeLessThan(
      ROBINHOOD_DEX_REQUESTS_PER_MINUTE / 2
    )
  })
  it("prices chosen coins from their best pair", async () => {
    const { fetchRobinhoodPrices } = await import("./markets")
    const prices = await fetchRobinhoodPrices("mainnet", [NVDA, BND])
    expect(prices).toEqual(new Map([[NVDA, 225.6]]))
    expect(get.mock.calls[0][1]).toBe(`/tokens/v1/robinhood/${BND},${NVDA}`)
  })
})
