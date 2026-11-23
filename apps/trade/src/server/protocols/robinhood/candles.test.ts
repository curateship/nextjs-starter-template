import { beforeEach, expect, it, vi } from "vitest"
import fixture from "./candles.fixture.json"

const { get, catalog } = vi.hoisted(() => ({ get: vi.fn(), catalog: vi.fn() }))
vi.mock("./client", async (original) => ({
  ...(await original<object>()),
  robinhoodServiceGet: get,
}))
vi.mock("./markets", async (original) => ({
  ...(await original<object>()),
  fetchRobinhoodMarkets: catalog,
}))
import { fetchRobinhoodCandleHistory } from "./candles"

const NVDA = fixture.token
// META's best pool on 24 Sep 2026 was a Uniswap v4 pool, named by a hash.
const META = "0xc0d6457c16cc70d6790dd43521c899c87ce02f35"
const META_POOL =
  "0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36"
const raw = fixture.data.attributes.ohlcv_list
const to = (raw[0][0] + 86_400) * 1000
const from = to - 200 * 86_400_000

beforeEach(() => {
  get.mockReset().mockResolvedValue(fixture)
  catalog.mockReset().mockResolvedValue({
    rows: [
      { marketId: NVDA, poolAddress: fixture.pool },
      { marketId: META, poolAddress: META_POOL },
    ],
  })
})

it("reads NVDA's real pool days, oldest first, priced for the token", async () => {
  const bars = await fetchRobinhoodCandleHistory("mainnet", NVDA, "1d", from, to)
  // The pool opened on 21 Jul 2026; that is all GeckoTerminal has.
  expect(bars).toHaveLength(66)
  expect(new Date(bars[0].openTime).toISOString()).toBe(
    "2026-07-21T00:00:00.000Z"
  )
  expect(bars.at(-1)?.close).toBeCloseTo(225.07, 2)
  expect(get).toHaveBeenCalledWith(
    "gecko",
    `/api/v2/networks/robinhood/pools/${fixture.pool}/ohlcv/day`,
    expect.objectContaining({ token: NVDA, currency: "usd", limit: 1000 })
  )
})

it("asks for a v4 pool by its 64-character id", async () => {
  await fetchRobinhoodCandleHistory("mainnet", META, "1d", from, to)
  expect(get.mock.calls[0][1]).toBe(
    `/api/v2/networks/robinhood/pools/${META_POOL}/ohlcv/day`
  )
})

it("finds no bars for a pool GeckoTerminal does not know, and keeps other refusals", async () => {
  get.mockRejectedValueOnce(
    new Error("ROBINHOOD_SERVICE_REFUSED:GeckoTerminal:404")
  )
  expect(
    await fetchRobinhoodCandleHistory("mainnet", NVDA, "1d", from, to)
  ).toEqual([])
  get.mockRejectedValueOnce(new Error("EXCHANGE_BUSY:GeckoTerminal"))
  await expect(
    fetchRobinhoodCandleHistory("mainnet", NVDA, "1d", from, to)
  ).rejects.toThrow("EXCHANGE_BUSY")
  await expect(
    fetchRobinhoodCandleHistory("testnet", NVDA, "1d", from, to)
  ).rejects.toThrow("ROBINHOOD_NETWORK_UNSUPPORTED")
})
