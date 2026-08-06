import { describe, expect, it } from "vitest"

import {
  namespaceMarketId,
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
