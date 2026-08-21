import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PaperOrder } from "@/lib/trade/paper"
import { readWatchedCache, writeWatchedCache } from "@/lib/trade/watched-cache"

/**
 * The levels the Watched tab draws before its own read has answered.
 *
 * The two things worth pinning down are that one account never reads another
 * account's levels off the same browser, and that a blob this build cannot
 * make sense of is dropped rather than half-drawn.
 */

function store(): Storage {
  const held = new Map<string, string>()
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
    removeItem: (key) => void held.delete(key),
    clear: () => held.clear(),
    key: (index) => [...held.keys()][index] ?? null,
    get length() {
      return held.size
    },
  }
}

function order(over: Partial<PaperOrder>): PaperOrder {
  return {
    id: "o1",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    side: "buy",
    px: 100,
    sz: 1,
    leverage: 3,
    maxLeverage: 40,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    watched: true,
    ...over,
  }
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: store() })
})

describe("the watched-price cache", () => {
  it("reads back what it wrote", () => {
    writeWatchedCache("user-1:hyperliquid", [order({})])
    expect(readWatchedCache("user-1:hyperliquid")?.rows).toEqual([
      {
        id: "o1",
        walletId: "w1",
        marketKey: "hyperliquid:mainnet:BTC",
        side: "buy",
        px: 100,
        sz: 1,
        createdAt: 1_000,
      },
    ])
  })

  it("keeps one account's levels away from another's", () => {
    writeWatchedCache("user-1:hyperliquid", [order({})])
    expect(readWatchedCache("user-2:hyperliquid")).toBeNull()
    expect(readWatchedCache("user-1:phemex")).toBeNull()
  })

  it("newest first, and only as many as it keeps", () => {
    const many = Array.from({ length: 70 }, (_, index) =>
      order({ id: `o${index}`, createdAt: index })
    )
    writeWatchedCache("user-1:hyperliquid", many)
    const rows = readWatchedCache("user-1:hyperliquid")?.rows ?? []
    expect(rows).toHaveLength(60)
    expect(rows[0]?.id).toBe("o69")
  })

  it("drops a blob it cannot make sense of instead of half-drawing it", () => {
    window.localStorage.setItem(
      "trade-watched-prices-user-1:hyperliquid",
      JSON.stringify({ rows: [{ id: "o1", px: "not a number" }] })
    )
    expect(readWatchedCache("user-1:hyperliquid")).toBeNull()
    window.localStorage.setItem(
      "trade-watched-prices-user-1:hyperliquid",
      "{ not json"
    )
    expect(readWatchedCache("user-1:hyperliquid")).toBeNull()
  })

  it("remembers an empty list, which is an answer and not a blank", () => {
    writeWatchedCache("user-1:hyperliquid", [])
    expect(readWatchedCache("user-1:hyperliquid")).toEqual({ rows: [] })
  })

  it("does not write again when nothing about the levels changed", () => {
    writeWatchedCache("user-1:hyperliquid", [order({})])
    const store = window.localStorage
    const spy = vi.spyOn(store, "setItem")
    writeWatchedCache("user-1:hyperliquid", [order({})])
    expect(spy).not.toHaveBeenCalled()
    writeWatchedCache("user-1:hyperliquid", [order({ px: 101 })])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
