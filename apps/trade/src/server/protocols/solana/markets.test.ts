import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "@/server/protocols/solana/jupiter.fixture.json"
import { clearSolanaClientState } from "@/server/protocols/solana/client"
import {
  clearSolanaMarketState,
  fetchSolanaMarkets,
  fetchSolanaPrices,
  jupiterTokenRow,
  PRICE_PAGE_SIZE,
  searchSolanaMarkets,
  solanaCandlesNotBuilt,
  toSolanaMarketCatalog,
  translateSolanaTokens,
  USDC_MINT,
} from "@/server/protocols/solana/markets"

/**
 * Jupiter's real answers, saved on 3 and 4 Sep 2026 and trimmed to the
 * records that matter: SOL, USDC itself, a tokenised stock, a metal, two
 * coins that both call themselves TRUMP, a coin Jupiter has no price for, a
 * coin with a price but no day's figures, a coin its audit flagged, an
 * unverified coin from the top-traded list, and one coin in both lists.
 */
type Token = { id: string; symbol: string; usdPrice?: number | null }
const verified = fixture.verified as Token[]
const topTraded = fixture.topTraded as Token[]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const fetchMock = vi.fn<typeof fetch>()
let savedKey: string | undefined

beforeEach(() => {
  savedKey = process.env.TRADE_JUPITER_API_KEY
  process.env.TRADE_JUPITER_API_KEY = "jup-key"
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  clearSolanaClientState()
  clearSolanaMarketState()
})

afterEach(() => {
  if (savedKey === undefined) delete process.env.TRADE_JUPITER_API_KEY
  else process.env.TRADE_JUPITER_API_KEY = savedKey
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clearSolanaClientState()
  clearSolanaMarketState()
})

/** Runs a call whose requests wait a second each under fake timers. */
async function settled<T>(work: Promise<T>): Promise<T> {
  const outcome = work.then(
    (value) => ({ value }),
    (error: Error) => ({ error })
  )
  await vi.runAllTimersAsync()
  const result = await outcome
  if ("error" in result) throw result.error
  return result.value
}

describe("one Jupiter token as a market row", () => {
  it("keys the coin by its mint address and prints the ticker", () => {
    const sol = verified.find((one) => one.symbol === "SOL")!
    const row = jupiterTokenRow("mainnet", sol)!
    expect(row.key).toBe(`solana:mainnet:${sol.id}`)
    expect(row.marketId).toBe(sol.id)
    expect(row.symbol).toBe("SOL")
    expect(row.quoteAsset).toBe("USDC")
    expect(row.category).toBe("crypto")
    expect(row.sizeDecimals).toBe(9)
    expect(row.priceTick).toBeNull()
    expect(row.maxLeverage).toBeNull()
    expect(row.fundingHourly).toBeNull()
    expect(row.price).toBeCloseTo(103.66, 1)
    // Jupiter says 3.29 for a 3.29% move; the row carries the fraction.
    expect(row.change24h).toBeCloseTo(0.0329, 3)
    expect(row.volume24hUsd).toBeGreaterThan(1_000_000)
    expect(row.iconUrl).toMatch(/^https:\/\//)
    expect(row.caution).toBeNull()
  })

  it("files a tokenised stock and a metal under their own kinds", () => {
    const stock = jupiterTokenRow(
      "mainnet",
      verified.find((one) => one.symbol === "CRCLx")
    )!
    expect(stock.category).toBe("stocks")
    const metal = jupiterTokenRow(
      "mainnet",
      verified.find((one) => one.symbol === "XAUt0")
    )!
    expect(metal.category).toBe("commodities")
  })

  it("leaves out a coin Jupiter has no price for, rather than pricing it at zero", () => {
    const unpriced = verified.find((one) => one.usdPrice == null)!
    expect(jupiterTokenRow("mainnet", unpriced)).toBeNull()
  })

  it("keeps a coin with a price but no day's figures, with blanks where they go", () => {
    const zsol = jupiterTokenRow(
      "mainnet",
      verified.find((one) => one.symbol === "ZSOL")
    )!
    expect(zsol.price).toBeGreaterThan(0)
    expect(zsol.change24h).toBeNull()
    expect(zsol.volume24hUsd).toBe(0)
  })

  it("carries the venue's own warning, suspicious over unverified", () => {
    const flagged = jupiterTokenRow(
      "mainnet",
      topTraded.find((one) => one.symbol === "stORE")
    )!
    expect(flagged.caution).toBe("suspicious")
    const unverified = jupiterTokenRow(
      "mainnet",
      topTraded.find((one) => one.symbol === "CTO")
    )!
    expect(unverified.caution).toBe("unverified")
  })

  it("never lists USDC as something to buy with USDC", () => {
    // **Checked against Jupiter's own answer, not against itself.** The
    // first version of this test built a record from `USDC_MINT` and fed it
    // back in, so it passed while the constant was wrong by one character
    // group and matched no real coin. This finds the real USDC record in the
    // saved answer, so a wrong constant fails here.
    const real = verified.find((one) => one.symbol === "USDC")
    expect(real, "the saved answer has no USDC to check against").toBeDefined()
    expect(real!.id).toBe(USDC_MINT)
    expect(jupiterTokenRow("mainnet", real)).toBeNull()
  })

  it("answers null for a record that is not a token", () => {
    expect(jupiterTokenRow("mainnet", { nonsense: true })).toBeNull()
    expect(jupiterTokenRow("mainnet", null)).toBeNull()
  })
})

describe("the whole list", () => {
  it("lists both coins called TRUMP, told apart by address", () => {
    const rows = translateSolanaTokens("mainnet", [verified])
    const trumps = rows.filter((row) => row.symbol === "TRUMP")
    expect(trumps).toHaveLength(2)
    expect(new Set(trumps.map((row) => row.key)).size).toBe(2)
  })

  it("lists a coin in both answers once, keeping the verified record", () => {
    const sol = verified.find((one) => one.symbol === "SOL")!
    const copy = { ...sol, isVerified: false }
    const rows = translateSolanaTokens("mainnet", [verified, [copy]])
    const sols = rows.filter((row) => row.marketId === sol.id)
    expect(sols).toHaveLength(1)
    expect(sols[0].caution).toBeNull()
  })

  it("says Solana, mainnet, with category tabs and a lookup", () => {
    const catalog = toSolanaMarketCatalog({
      network: "mainnet",
      verified,
      topTraded,
    })
    expect(catalog.protocolLabel).toBe("Solana")
    expect(catalog.networkLabel).toBe("Mainnet")
    expect(catalog.picker).toEqual({
      categories: "catalog",
      hip3: false,
      funding: false,
      openInterest: false,
      search: true,
    })
    // Eight verified less the unpriced one and USDC itself, plus the three
    // top traded.
    expect(catalog.rows).toHaveLength(9)
  })
})

describe("asking Jupiter for the list", () => {
  it("makes two requests a minute and answers the catalogue", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(verified))
      .mockResolvedValueOnce(jsonResponse(topTraded))
    const catalog = await settled(fetchSolanaMarkets("mainnet"))
    expect(catalog.rows).toHaveLength(9)
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls).toEqual([
      "https://api.jup.ag/tokens/v2/tag?query=verified",
      "https://api.jup.ag/tokens/v2/toptraded/24h?limit=100",
    ])
  })

  it("serves the last good list when a refresh fails, never an empty one", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(verified))
      .mockResolvedValueOnce(jsonResponse(topTraded))
    const first = await settled(fetchSolanaMarkets("mainnet"))
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    fetchMock.mockResolvedValue(jsonResponse({}, 500))
    const again = await settled(fetchSolanaMarkets("mainnet"))
    expect(again).toBe(first)
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
  })

  it("builds the same list with no key, from the keyless host", async () => {
    delete process.env.TRADE_JUPITER_API_KEY
    fetchMock
      .mockResolvedValueOnce(jsonResponse(verified))
      .mockResolvedValueOnce(jsonResponse(topTraded))
    const catalog = await settled(fetchSolanaMarkets("mainnet"))
    expect(catalog.rows).toHaveLength(9)
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://lite-api.jup.ag/tokens/v2/tag?query=verified",
      "https://lite-api.jup.ag/tokens/v2/toptraded/24h?limit=100",
    ])
  })

  it("refuses the practice network by name", async () => {
    await expect(fetchSolanaMarkets("testnet")).rejects.toThrow(
      "SOLANA_NETWORK_UNSUPPORTED"
    )
  })
})

describe("finding a coin outside the list", () => {
  it("asks Jupiter's search and answers priced coins with their warnings", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture.search))
    const rows = await settled(searchSolanaMarkets("mainnet", " bonk "))
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.jup.ag/tokens/v2/search?query=bonk"
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].symbol).toBe("Bonk")
    expect(rows.every((row) => row.price > 0)).toBe(true)
  })
})

describe("prices", () => {
  it("asks in pages of fifty and leaves out a coin Jupiter did not price", async () => {
    const ids = Array.from({ length: PRICE_PAGE_SIZE + 2 }, (_, i) => `mint${i}`)
    fetchMock.mockImplementation(async (url) => {
      const asked = new URL(String(url)).searchParams.get("ids")!.split(",")
      const body: Record<string, { usdPrice: number } | null> = {}
      for (const id of asked) {
        // The last coin is the one Jupiter has not traded in a week.
        body[id] = id === "mint51" ? null : { usdPrice: Number(id.slice(4)) + 1 }
      }
      return jsonResponse(body)
    })
    const prices = await settled(fetchSolanaPrices("mainnet", ids))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(prices.get("mint0")).toBe(1)
    expect(prices.get("mint50")).toBe(51)
    expect(prices.has("mint51")).toBe(false)
  })

  it("reads the real price answer and shares one page for two seconds", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(fixture.price))
    const sol = "So11111111111111111111111111111111111111112"
    const first = await settled(fetchSolanaPrices("mainnet", [sol]))
    const second = await settled(fetchSolanaPrices("mainnet", [sol]))
    expect(first.get(sol)).toBeCloseTo(103.64, 1)
    expect(second.get(sol)).toBe(first.get(sol))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("the chart, before it is built", () => {
  it("refuses in words the chart prints as they are", async () => {
    await expect(solanaCandlesNotBuilt()).rejects.toThrow(
      /^CANDLES_UNAVAILABLE:Solana charts are not built yet/
    )
  })
})
