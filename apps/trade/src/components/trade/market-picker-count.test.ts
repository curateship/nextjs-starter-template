import { describe, expect, it } from "vitest"

import { marketsCounted } from "@/components/trade/market-picker"
import type { MarketCategory, MarketRow } from "@/lib/protocols/contracts"

/**
 * The line under the market list.
 *
 * It used to say "96 markets", which is the same sentence whether the list is
 * every coin on the venue or the four stocks a filter left behind. What is in
 * the list is the part worth saying (Tyler, 14 Sep 2026).
 */
function rows(counts: Partial<Record<MarketCategory, number>>): MarketRow[] {
  const out: MarketRow[] = []
  for (const [category, many] of Object.entries(counts)) {
    for (let index = 0; index < (many ?? 0); index++) {
      out.push({ category, symbol: `${category}${index}` } as MarketRow)
    }
  }
  return out
}

describe("the market list's count", () => {
  it("breaks the list down by what the markets are", () => {
    expect(marketsCounted(rows({ crypto: 95, stocks: 44 }))).toBe(
      "95 crypto and 44 stock markets"
    )
  })

  it("keeps the catalogue's own order and commas the middle kinds", () => {
    expect(marketsCounted(rows({ forex: 7, stocks: 44, crypto: 95 }))).toBe(
      "95 crypto, 44 stock and 7 FX markets"
    )
  })

  it("says one kind on its own without an and", () => {
    expect(marketsCounted(rows({ crypto: 96 }))).toBe("96 crypto markets")
  })

  it("keeps the word singular for one market and honest for none", () => {
    expect(marketsCounted(rows({ stocks: 1 }))).toBe("1 stock market")
    expect(marketsCounted([])).toBe("0 markets")
  })
})
