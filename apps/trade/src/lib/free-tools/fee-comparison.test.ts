import { describe, expect, it } from "vitest"

import {
  FEE_TABLE,
  compareFees,
  formatRate,
  isStale,
  type FeeRow,
} from "./fee-comparison"

const exchangeA: FeeRow = {
  id: "a",
  name: "Exchange A",
  makerPercent: 0.015,
  takerPercent: 0.045,
  sourceUrl: "https://example.com/a",
  checkedOn: "2026-09-25",
}
const exchangeB: FeeRow = {
  id: "b",
  name: "Exchange B",
  makerPercent: 0.01,
  takerPercent: 0.02,
  sourceUrl: "https://example.com/b",
  checkedOn: "2026-09-25",
}

describe("the monthly sum", () => {
  it("charges $4.50 a trade and $180 a month at 0.045%, and $80 at 0.02%", () => {
    const [cheapest, dearest] = compareFees(
      { tradeSize: 10_000, tradesPerMonth: 40, makerPer100: 0 },
      [exchangeA, exchangeB]
    )
    expect(cheapest.name).toBe("Exchange B")
    expect(cheapest.perTrade).toBeCloseTo(2, 10)
    expect(cheapest.perMonth).toBeCloseTo(80, 10)
    expect(dearest.perTrade).toBeCloseTo(4.5, 10)
    expect(dearest.perMonth).toBeCloseTo(180, 10)
  })

  it("mixes maker and taker by how many out of 100 rest on the book", () => {
    // 30 maker trades at 0.015% and 70 taker at 0.045% on $10,000:
    // $10,000 × (0.3 × 0.015% + 0.7 × 0.045%) = $3.60 a trade.
    const [row] = compareFees(
      { tradeSize: 10_000, tradesPerMonth: 100, makerPer100: 30 },
      [exchangeA]
    )
    expect(row.perTrade).toBeCloseTo(3.6, 10)
    expect(row.perMonth).toBeCloseTo(360, 10)
  })

  it("uses only the maker rate when every trade rests on the book", () => {
    const [row] = compareFees(
      { tradeSize: 10_000, tradesPerMonth: 1, makerPer100: 100 },
      [exchangeA]
    )
    expect(row.perTrade).toBeCloseTo(1.5, 10)
  })

  it("puts equal costs in name order", () => {
    const zero = { makerPercent: 0, takerPercent: 0 }
    const rows = compareFees(
      { tradeSize: 1000, tradesPerMonth: 10, makerPer100: 0 },
      [
        { ...exchangeB, ...zero, name: "Zeta" },
        { ...exchangeA, ...zero, name: "Alpha" },
      ]
    )
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Zeta"])
  })
})

describe("the checked date", () => {
  it("warns only once a row is more than 90 days old", () => {
    const row = { ...exchangeA, checkedOn: "2026-01-01" }
    expect(isStale(row, "2026-04-01")).toBe(false) // 90 days
    expect(isStale(row, "2026-04-02")).toBe(true) // 91 days
  })
})

describe("the fee table", () => {
  it("gives every row a source link, a real checked date and sane rates", () => {
    for (const row of FEE_TABLE) {
      expect(row.sourceUrl).toMatch(/^https:\/\//)
      expect(row.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(row.checkedOn))).toBe(false)
      expect(row.makerPercent).toBeGreaterThanOrEqual(0)
      expect(row.takerPercent).toBeGreaterThanOrEqual(0)
      expect(row.takerPercent).toBeLessThan(1)
    }
  })

  it("lists each exchange once", () => {
    const ids = FEE_TABLE.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("formatRate", () => {
  it("writes rates the way the exchanges do", () => {
    expect(formatRate(0.045)).toBe("0.045%")
    expect(formatRate(0)).toBe("0%")
    expect(formatRate(0.0125)).toBe("0.0125%")
  })
})
