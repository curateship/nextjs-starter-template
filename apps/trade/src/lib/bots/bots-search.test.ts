import { describe, expect, it } from "vitest"

import { botsRecordHref, botsViewOf, readBotsSearch } from "@/lib/bots/bots-search"

describe("the Bots dashboard's address", () => {
  it("opens on Overview, and keeps nothing else there", () => {
    expect(botsViewOf(readBotsSearch({}))).toBe("overview")
    expect(readBotsSearch({ view: "overview", open: "x", q: "btc" })).toEqual({ view: "overview" })
    expect(readBotsSearch({ view: "nonsense" })).toEqual({ view: undefined })
  })

  it("picks a line, then opens it in the middle", () => {
    expect(readBotsSearch({ view: "bots", open: "run-1" })).toMatchObject({ view: "bots", open: "run-1", full: undefined })
    // The router hands `full` back as a number or a word, whichever the link wrote.
    for (const full of [1, "1", true, "true"]) {
      expect(readBotsSearch({ view: "bots", open: "run-1", full }).full).toBe(true)
    }
    // Nothing picked means nothing to open.
    expect(readBotsSearch({ view: "bots", full: 1 }).full).toBeUndefined()
  })

  it("keeps a coin only on an opened run, and a step only on an opened recipe", () => {
    const coin = "hyperliquid:mainnet:BTC"
    expect(readBotsSearch({ view: "backtests", open: "b", full: 1, coin }).coin).toBe(coin)
    expect(readBotsSearch({ view: "backtests", open: "b", coin }).coin).toBeUndefined()
    expect(readBotsSearch({ view: "recipes", open: "r", full: 1, coin }).coin).toBeUndefined()
    expect(readBotsSearch({ view: "recipes", open: "r", full: 1, node: "step-1" }).node).toBe("step-1")
    expect(readBotsSearch({ view: "bots", open: "r", full: 1, node: "step-1" }).node).toBeUndefined()
  })

  it("keeps Show archived for backtests only, and refuses ids and coins too long to be real", () => {
    expect(readBotsSearch({ view: "backtests", archived: "1" }).archived).toBe(true)
    expect(readBotsSearch({ view: "bots", archived: "1" }).archived).toBeUndefined()
    expect(readBotsSearch({ view: "bots", open: "x".repeat(37) }).open).toBeUndefined()
    expect(readBotsSearch({ view: "bots", open: "r", full: 1, coin: "x".repeat(121) }).coin).toBeUndefined()
  })

  it("writes a stored link that reads back as the same opened record", () => {
    const href = botsRecordHref("bots", "a&b")
    expect(href).toBe("/bots?view=bots&open=a%26b&full=1")
    const params = Object.fromEntries(new URL(href, "https://trade.example").searchParams)
    expect(readBotsSearch(params)).toMatchObject({ view: "bots", open: "a&b", full: true })
  })

  it("keeps a recipe filter on Backtests only", () => {
    expect(readBotsSearch({ view: "backtests", recipe: "r-1" }).recipe).toBe("r-1")
    expect(readBotsSearch({ view: "recipes", recipe: "r-1" }).recipe).toBeUndefined()
    expect(readBotsSearch({ view: "backtests", recipe: "x".repeat(81) }).recipe).toBeUndefined()
  })
})
