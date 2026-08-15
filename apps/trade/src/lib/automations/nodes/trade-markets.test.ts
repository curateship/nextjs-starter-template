import { describe, expect, it } from "vitest"

import {
  coinsAllowedFor,
  MAX_BACKTEST_MARKETS,
  trimMarketsToFit,
} from "@/lib/automations/nodes/trade-markets"

/**
 * How many coins a Markets step is allowed to hold, and the step cutting its
 * own list down to that number.
 *
 * **This is the rule a real flow ran into for two days.** A list of 406 coins
 * was picked over a window of about a year, which fits, and later stretched to
 * a window of 1000 days, which does not. Nothing trimmed the list and nothing
 * said a word: every press of Run finished in about thirty milliseconds having
 * tested nothing, while the canvas went on showing the result of an hour
 * before. The step is the only place that can answer this while somebody is
 * still choosing, so this is where it is answered.
 *
 * The window is the half that catches people out. The coins are what they are
 * looking at; the window is a number on another card.
 */

const coins = (count: number) =>
  Array.from({ length: count }, (_, at) => `binance:mainnet:C${at}`)

describe("how many coins fit", () => {
  it("buys fewer coins the longer the window gets", () => {
    // Every coin costs its whole window of candles and a run holds them all at
    // once, so the two trade off directly.
    expect(coinsAllowedFor("4h", 365)).toBeGreaterThan(coinsAllowedFor("4h", 1000))
    expect(coinsAllowedFor("4h", 1000)).toBeGreaterThan(coinsAllowedFor("4h", 2000))
  })

  it("fits the most coins at 4h, and fewer either side of it", () => {
    // Not what anybody guesses, and worth pinning down. Every run reads the 4h
    // series whatever it is set to, because that is what the base rule looks
    // at — so a run that is itself on 4h pays for one set of candles and a run
    // on anything else pays for two. Bigger is NOT cheaper.
    expect(coinsAllowedFor("1d", 1000)).toBeLessThan(coinsAllowedFor("4h", 1000))
    expect(coinsAllowedFor("1h", 1000)).toBeLessThan(coinsAllowedFor("4h", 1000))
  })

  it("never offers more than the list ceiling, however short the window", () => {
    expect(coinsAllowedFor("1d", 1)).toBe(MAX_BACKTEST_MARKETS)
  })

  it("never answers zero, however greedy the window", () => {
    // Saying "0 coins allowed" would send somebody hunting through the coin
    // list when the window is the thing to change.
    expect(coinsAllowedFor("5m", 3_650)).toBeGreaterThanOrEqual(1)
  })
})

describe("cutting the list down to what fits", () => {
  it("leaves a list that already fits exactly as it was", () => {
    const settings = { days: 365, marketKeys: coins(403) }

    expect(trimMarketsToFit(settings, "4h", false).marketKeys).toHaveLength(403)
  })

  it("cuts the list when the window is stretched under it", () => {
    // The bug, in one line: the same 403 coins, and only the window changed.
    const picked = coins(403)

    expect(trimMarketsToFit({ days: 365, marketKeys: picked }, "4h", false)
      .marketKeys).toHaveLength(403)
    expect(trimMarketsToFit({ days: 1000, marketKeys: picked }, "4h", false)
      .marketKeys).toHaveLength(coinsAllowedFor("4h", 1000))
  })

  it("keeps the busiest coins, which are the ones at the front", () => {
    const trimmed = trimMarketsToFit(
      { days: 1000, marketKeys: coins(403) },
      "4h",
      false
    ).marketKeys as string[]

    expect(trimmed[0]).toBe("binance:mainnet:C0")
    expect(trimmed.at(-1)).toBe(`binance:mainnet:C${trimmed.length - 1}`)
  })

  it("measures the window by the two dates when they are named", () => {
    // `days` is ignored the moment a stretch is named, so the trim has to read
    // the dates too — a short `days` left underneath long dates would have
    // waved the whole list through.
    const settings = {
      days: 30,
      from: "2023-11-19",
      to: "2026-08-15",
      marketKeys: coins(403),
    }

    expect(trimMarketsToFit(settings, "4h", false).marketKeys).toHaveLength(
      coinsAllowedFor("4h", 1000)
    )
  })

  it("cuts least at 4h, for the same window", () => {
    const long = { days: 1000, marketKeys: coins(500) }

    expect(
      (trimMarketsToFit(long, "1d", false).marketKeys as string[]).length
    ).toBeLessThan(
      (trimMarketsToFit(long, "4h", false).marketKeys as string[]).length
    )
  })

  it("only holds a flow that trades to the length of the list", () => {
    // A named wallet means there is no history to walk and nothing held in
    // memory, so the window buys nothing and cannot take coins away.
    const settings = { days: 3_650, marketKeys: coins(500) }

    expect(trimMarketsToFit(settings, "4h", true).marketKeys).toHaveLength(
      MAX_BACKTEST_MARKETS
    )
  })

  it("drops a coin named twice before counting", () => {
    const settings = { days: 30, marketKeys: ["a", "b", "a"] }

    expect(trimMarketsToFit(settings, "4h", false).marketKeys).toEqual(["a", "b"])
  })

  it("leaves every other setting alone", () => {
    const settings = {
      days: 1000,
      protocol: "binance",
      minimumVolume: "10m",
      marketKeys: coins(403),
    }
    const after = trimMarketsToFit(settings, "4h", false)

    expect(after.protocol).toBe("binance")
    expect(after.minimumVolume).toBe("10m")
    expect(after.days).toBe(1000)
  })

  it("copes with a step that has no coins on it yet", () => {
    const settings: Record<string, unknown> = { days: 30 }

    expect(trimMarketsToFit(settings, "4h", false).marketKeys).toEqual([])
  })
})
