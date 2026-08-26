import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { lighterPublic } from "@/server/protocols/lighter/client"
import {
  clearLighterMarketState,
  fetchLighterPrices,
  lighterMarketFacts,
} from "@/server/protocols/lighter/markets"

vi.mock("@/server/protocols/lighter/client", () => ({
  lighterPublic: vi.fn(),
}))

const publicRead = vi.mocked(lighterPublic)

const BORN_AT = 1_737_098_461_107

const CATALOG = {
  code: 200,
  order_book_details: [
    {
      symbol: "BTC",
      market_id: 1,
      market_type: "perp",
      status: "active",
      size_decimals: 5,
      price_decimals: 1,
      created_at: String(BORN_AT),
      mark_price: "78584.1",
      last_trade_price: 78_581.8,
    },
    {
      symbol: "NODATE",
      market_id: 2,
      market_type: "perp",
      status: "active",
      size_decimals: 2,
      price_decimals: 2,
      mark_price: "10.5",
      last_trade_price: 10.4,
    },
  ],
}

beforeEach(() => {
  vi.useFakeTimers()
  publicRead.mockReset()
  publicRead.mockResolvedValue(CATALOG)
  clearLighterMarketState()
})

afterEach(() => {
  vi.useRealTimers()
  clearLighterMarketState()
})

describe("what the catalogue teaches", () => {
  it("learns a market's number and first day from one read", async () => {
    const btc = await lighterMarketFacts("mainnet", "BTC")
    expect(btc).toEqual({ id: 1, bornAt: BORN_AT })
    expect(publicRead).toHaveBeenCalledTimes(1)
    expect(publicRead.mock.calls[0]?.[1]).toBe("/api/v1/orderBookDetails")
    expect(publicRead.mock.calls[0]?.[3]).toMatchObject({ filter: "perp" })
  })

  it("answers a second market without asking Lighter again", async () => {
    await lighterMarketFacts("mainnet", "BTC")
    await lighterMarketFacts("mainnet", "NODATE")
    expect(publicRead).toHaveBeenCalledTimes(1)
  })

  it("says nothing was stated when a market has no first day", async () => {
    // A blank first day must not read as "born at the epoch", which would
    // let a history walk ask for 1970.
    expect(await lighterMarketFacts("mainnet", "NODATE")).toEqual({
      id: 2,
      bornAt: null,
    })
  })

  it("refuses a market Lighter does not list", async () => {
    await expect(lighterMarketFacts("mainnet", "NOPE")).rejects.toThrow(
      "LIGHTER_MARKET_UNKNOWN"
    )
  })

  it("holds one catalogue for ten seconds, then reads again", async () => {
    // A price poll running every second must not spend sixty of Lighter's
    // sixty requests a minute. Ten seconds makes it six.
    await fetchLighterPrices("mainnet", ["BTC"])
    vi.setSystemTime(Date.now() + 9_000)
    await fetchLighterPrices("mainnet", ["BTC"])
    expect(publicRead).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 2_000)
    await fetchLighterPrices("mainnet", ["BTC"])
    expect(publicRead).toHaveBeenCalledTimes(2)
  })

  it("prices only the markets asked for, and only real prices", async () => {
    const prices = await fetchLighterPrices("mainnet", ["BTC", "NOPE"])
    expect([...prices.entries()]).toEqual([["BTC", 78_584.1]])
  })

  it("does not remember one network's markets for the other", async () => {
    await lighterMarketFacts("mainnet", "BTC")
    publicRead.mockResolvedValue({ code: 200, order_book_details: [] })
    await expect(lighterMarketFacts("testnet", "BTC")).rejects.toThrow(
      "LIGHTER_MARKET_UNKNOWN"
    )
  })
})
