import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The leverage limit a replay is closed out by.
 *
 * A backtest runs on Binance history, and Binance reports no leverage limit at
 * all. Read straight through, that becomes a limit of 1, and a limit of 1 means
 * `liquidationPx` gives up — so every leveraged replay reported its winners
 * doubled and none of the positions the exchange would have taken away. These
 * cover the fill-in that stops that, and the two cases where nothing should be
 * filled in at all.
 */

/** Called with the protocol being asked, so a test can answer each one. */
const fetchMarkets = vi.fn()

vi.mock("@/server/protocols/registry", () => ({
  getProtocol: (id: string) => ({
    markets: { fetch: (network: string) => fetchMarkets(id, network) },
  }),
}))

const {
  ASSUMED_REPLAY_MAX_LEVERAGE,
  clearMarketRulesCache,
  replayMarketRules,
} = await import(
  "@/server/trade/market-rules"
)

function row(marketId: string, maxLeverage: number | null) {
  return { marketId, sizeDecimals: 2, maxLeverage, volume24hUsd: 1_000 }
}

beforeEach(() => {
  clearMarketRulesCache()
  fetchMarkets.mockReset()
})

describe("the limit a replay is closed out by", () => {
  it("takes Hyperliquid's when the replayed venue has none", async () => {
    // Binance says null because leverage there is a per-account setting it
    // cannot ask about. The money is going to Hyperliquid, so Hyperliquid's
    // limit is the one that will really apply.
    fetchMarkets.mockImplementation((id: string) =>
      Promise.resolve({
        // A lookup, not a comparison — the protocol fence bans comparing
        // against a protocol name anywhere, tests included, and a record
        // says the same thing.
        rows: [row("SIREN", { hyperliquid: 3 }[id] ?? null)],
      })
    )

    const rules = await replayMarketRules("binance", "mainnet", "SIREN")
    expect(rules?.maxLeverage).toBe(3)
    // Everything else stays the replayed venue's own.
    expect(rules?.sizeDecimals).toBe(2)
    expect(fetchMarkets.mock.calls.map(([id]) => id)).toEqual([
      "binance",
      "hyperliquid",
    ])
  })

  it("leaves a venue that answered for itself alone", async () => {
    fetchMarkets.mockResolvedValue({ rows: [row("BTC", 40)] })

    const rules = await replayMarketRules("hyperliquid", "mainnet", "BTC")
    expect(rules?.maxLeverage).toBe(40)
    // Asked once. A second catalogue fetch per coin would be paid on every
    // coin of every run, for an answer already in hand.
    expect(fetchMarkets).toHaveBeenCalledTimes(1)
  })

  it("assumes the harshest real ceiling when nobody lists the coin", async () => {
    // Most of a Binance replay lands here — 295 of 473 coins on a recent run.
    // Left null they would have no liquidation price at all, so a borrowed run
    // would show the upside of borrowing everywhere and the downside almost
    // nowhere. An assumption that is written down beats one of infinity.
    fetchMarkets.mockResolvedValue({ rows: [row("GUA", null)] })

    const rules = await replayMarketRules("binance", "mainnet", "GUA")
    expect(rules?.maxLeverage).toBe(ASSUMED_REPLAY_MAX_LEVERAGE)
    expect(ASSUMED_REPLAY_MAX_LEVERAGE).toBe(3)
  })

  it("still refuses a coin the replayed venue does not list", async () => {
    fetchMarkets.mockResolvedValue({ rows: [row("BTC", 40)] })

    expect(await replayMarketRules("binance", "mainnet", "GONE")).toBeNull()
  })
})
