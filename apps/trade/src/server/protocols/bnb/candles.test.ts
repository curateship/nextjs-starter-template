import { beforeEach, describe, expect, it, vi } from "vitest"
import fixture from "./candles.fixture.json"
const { get, catalog } = vi.hoisted(() => ({ get: vi.fn(), catalog: vi.fn() }))
vi.mock("./client", () => ({ bnbServiceGet: get }))
vi.mock("./markets", async (original) => ({
  ...(await original<object>()),
  fetchBnbMarkets: catalog,
}))
import { fetchBnbCandleHistory, parseBnbCandles } from "./candles"
const id = "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82"
const pool = "0xafb2da14056725e3ba3a30dd846b6bbbd7886c56"
const raw = fixture.data.attributes.ohlcv_list
const to = (raw[0][0] + 86400) * 1000
const from = to - 200 * 86400_000
beforeEach(() => {
  get.mockReset().mockResolvedValue(fixture)
  catalog
    .mockReset()
    .mockResolvedValue({ rows: [{ marketId: id, poolAddress: pool }] })
})
describe("BNB pool candles", () => {
  it("reads the saved real daily answer in ascending milliseconds without inventing bars", async () => {
    const bars = await fetchBnbCandleHistory("mainnet", id, "1d", from, to)
    expect(bars).toHaveLength(184)
    expect(bars[0].openTime).toBe(raw.at(-1)![0] * 1000)
    expect(bars.at(-1)).toEqual({
      openTime: raw[0][0] * 1000,
      open: raw[0][1],
      high: raw[0][2],
      low: raw[0][3],
      close: raw[0][4],
      volume: raw[0][5],
    })
    expect(get).toHaveBeenCalledWith(
      "gecko",
      `/api/v2/networks/bsc/pools/${pool}/ohlcv/day`,
      expect.objectContaining({
        token: id,
        currency: "usd",
        limit: 1000,
        aggregate: 1,
      })
    )
  })
  it.each([
    ["1m", "minute", 1],
    ["5m", "minute", 5],
    ["15m", "minute", 15],
    ["1h", "hour", 1],
    ["4h", "hour", 4],
    ["1d", "day", 1],
  ] as const)(
    "maps %s to the provider's frame",
    async (interval, frame, aggregate) => {
      await fetchBnbCandleHistory("mainnet", id, interval, to - 60000, to)
      expect(get).toHaveBeenCalledWith(
        "gecko",
        expect.stringContaining(`/ohlcv/${frame}`),
        expect.objectContaining({ aggregate })
      )
    }
  )
  it("filters outside the requested half-open window", () => {
    const start = raw[10][0] * 1000
    expect(parseBnbCandles(fixture, start, start + 86400_000)).toHaveLength(1)
    expect(parseBnbCandles(fixture, to, to + 86400_000)).toEqual([])
  })
  it("returns no bars for a missing pool but propagates rate limits and invalid data", async () => {
    get.mockRejectedValueOnce(
      new Error("BNB_SERVICE_REFUSED:GeckoTerminal:404")
    )
    expect(await fetchBnbCandleHistory("mainnet", id, "1d", from, to)).toEqual(
      []
    )
    get.mockRejectedValueOnce(new Error("EXCHANGE_BUSY:GeckoTerminal"))
    await expect(
      fetchBnbCandleHistory("mainnet", id, "1d", from, to)
    ).rejects.toThrow("EXCHANGE_BUSY")
    expect(() => parseBnbCandles({}, from, to)).toThrow()
    const bad = structuredClone(fixture)
    bad.data.attributes.ohlcv_list[0][2] = 0
    expect(() => parseBnbCandles(bad, from, to)).toThrow()
  })
  it("refuses invalid identifiers, oversized pages and networks before requests", async () => {
    await expect(
      fetchBnbCandleHistory("testnet", id, "1d", from, to)
    ).rejects.toThrow("BNB_NETWORK")
    await expect(
      fetchBnbCandleHistory("mainnet", "../oops", "1d", from, to)
    ).rejects.toThrow()
    await expect(
      fetchBnbCandleHistory("mainnet", id, "1m", from, to)
    ).rejects.toThrow("PAGE_TOO_LARGE")
    expect(get).not.toHaveBeenCalled()
  })
})
