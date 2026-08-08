import { describe, expect, it } from "vitest"

import {
  namespaceMarketId,
  roundOrderPx,
  sameFigures,
  toLiveFigures,
} from "@/lib/protocols/hyperliquid/translate"

describe("the shared naming rule", () => {
  it("namespaces venue assets and leaves the main exchange bare", () => {
    expect(namespaceMarketId("", "BTC")).toBe("BTC")
    expect(namespaceMarketId("xyz", "AAPL")).toBe("xyz:AAPL")
    // Already namespaced on the wire: not doubled.
    expect(namespaceMarketId("xyz", "xyz:AAPL")).toBe("xyz:AAPL")
  })
})

describe("streamed figures", () => {
  const CTX = {
    markPx: "67400",
    prevDayPx: "66000",
    dayNtlVlm: "1500000000",
    funding: "0.0000125",
    openInterest: "12000",
  }

  it("does the same arithmetic as the HTTP translate", () => {
    const figures = toLiveFigures(CTX)
    expect(figures?.price).toBe(67400)
    expect(figures?.change24h).toBeCloseTo((67400 - 66000) / 66000)
    expect(figures?.openInterestUsd).toBeCloseTo(12000 * 67400)
  })

  it("refuses a junk price outright — the last good figures stand", () => {
    expect(toLiveFigures({ ...CTX, markPx: "junk" })).toBeNull()
  })

  it("tells identical updates from moved ones, so still rows stay silent", () => {
    const a = toLiveFigures(CTX)
    const b = toLiveFigures({ ...CTX })
    const moved = toLiveFigures({ ...CTX, markPx: "67401" })
    expect(a && b && sameFigures(a, b)).toBe(true)
    expect(a && moved && sameFigures(a, moved)).toBe(false)
  })
})

describe("a price the exchange would accept", () => {
  it("keeps five significant digits", () => {
    expect(roundOrderPx(1234.567, 3)).toBe(1234.6)
    // A coin traded in whole units gets the full six decimal places.
    expect(roundOrderPx(0.0234117, 0)).toBe(0.023412)
  })

  it("leaves whole numbers alone however long they run", () => {
    // Five significant digits would make this $118,200; whole prices are
    // always allowed, so the level actually clicked survives.
    expect(roundOrderPx(118_204.4, 3)).toBe(118_204)
  })

  it("gives a market with finer sizes fewer decimal places of price", () => {
    // Six decimals less the size decimals: five here, three there, one there.
    expect(roundOrderPx(0.0234117, 1)).toBe(0.02341)
    expect(roundOrderPx(0.0234117, 3)).toBe(0.023)
    expect(roundOrderPx(1.23456, 5)).toBe(1.2)
  })

  it("hands back anything that could not be a price for the caller to refuse", () => {
    expect(roundOrderPx(0, 3)).toBe(0)
    expect(roundOrderPx(-5, 3)).toBe(-5)
    expect(roundOrderPx(Number.NaN, 3)).toBeNaN()
  })
})
