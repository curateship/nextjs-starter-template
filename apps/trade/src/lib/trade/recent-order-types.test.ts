import { describe, expect, it } from "vitest"

import {
  loadRecentOrderTypes,
  readRecentOrderTypes,
  saveRecentOrderTypes,
  withRecentOrderType,
} from "@/lib/trade/recent-order-types"

function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe("recent order types", () => {
  it("puts the latest placed kind first without keeping duplicates", () => {
    expect(withRecentOrderType(["grid", "buy", "dca"], "buy")).toEqual([
      "buy",
      "grid",
      "dca",
    ])
  })

  it("keeps one of every supported kind at most", () => {
    expect(withRecentOrderType(["buy", "sell", "dca", "grid"], "grid")).toEqual(
      ["grid", "buy", "sell", "dca"]
    )
  })

  it("drops saved data it cannot understand", () => {
    expect(readRecentOrderTypes(["grid", "market"])).toEqual([])
    expect(readRecentOrderTypes(["grid", "grid", "buy"])).toEqual([
      "grid",
      "buy",
    ])
  })

  it("keeps different signed-in accounts separate in one browser", () => {
    const storage = memory()
    saveRecentOrderTypes("mine", ["grid", "buy"], storage)
    saveRecentOrderTypes("theirs", ["dca"], storage)

    expect(loadRecentOrderTypes("mine", storage)).toEqual(["grid", "buy"])
    expect(loadRecentOrderTypes("theirs", storage)).toEqual(["dca"])
  })

  it("starts empty when browser storage is missing or unreadable", () => {
    const broken = {
      getItem: () => "not-json",
      setItem: () => {},
    }

    expect(loadRecentOrderTypes("mine", null)).toEqual([])
    expect(loadRecentOrderTypes("mine", broken)).toEqual([])
  })
})
