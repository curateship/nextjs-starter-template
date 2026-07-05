import { describe, expect, it } from "vitest"

import {
  DEFAULT_TRADE_ALERT_OPTIONS,
  evaluateTradeAlerts,
  takerOf,
  type ScannerTradeEvent,
  type TradeAlertOptions,
} from "./alert-engine"

const BASE_TS = 1_750_000_000_000

function trade(overrides: Partial<ScannerTradeEvent>): ScannerTradeEvent {
  return {
    tid: Math.floor(Math.random() * 1e12),
    ts: BASE_TS,
    coin: "BTC",
    side: "buy",
    px: 100_000,
    sz: 1,
    notional: 100_000,
    buyer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    seller: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ...overrides,
  }
}

function options(overrides?: Partial<TradeAlertOptions>): TradeAlertOptions {
  return {
    ...DEFAULT_TRADE_ALERT_OPTIONS,
    ignoredAddresses: new Set(),
    ...overrides,
  }
}

describe("takerOf", () => {
  it("returns the buyer on taker buys and the seller on taker sells", () => {
    const event = trade({})
    expect(takerOf(event)).toBe(event.buyer)
    expect(takerOf(trade({ side: "sell" }))).toBe(event.seller)
  })
})

describe("whale_trade rule", () => {
  it("alerts on a single trade at or above the threshold", () => {
    const big = trade({ notional: 250_000 })
    const drafts = evaluateTradeAlerts([big], [big], options())
    const whale = drafts.find((draft) => draft.type === "whale_trade")
    expect(whale).toBeDefined()
    expect(whale?.title).toContain("bought")
    expect(whale?.title).toContain("BTC")
    expect(whale?.address).toBe(big.buyer)
  })

  it("stays quiet below the threshold", () => {
    const small = trade({ notional: 249_999 })
    const drafts = evaluateTradeAlerts([small], [small], options())
    expect(drafts.find((draft) => draft.type === "whale_trade")).toBeUndefined()
  })

  it("skips ignored takers", () => {
    const big = trade({ notional: 500_000 })
    const drafts = evaluateTradeAlerts(
      [big],
      [big],
      options({ ignoredAddresses: new Set([big.buyer]) })
    )
    expect(drafts).toHaveLength(0)
  })

  it("uses 'sold' and the seller address on taker sells", () => {
    const big = trade({ side: "sell", notional: 300_000 })
    const drafts = evaluateTradeAlerts([big], [big], options())
    const whale = drafts.find((draft) => draft.type === "whale_trade")
    expect(whale?.title).toContain("sold")
    expect(whale?.address).toBe(big.seller)
  })
})

describe("repeat_trades rule", () => {
  it("alerts when the same taker hits the same coin+side 3x in 10 minutes", () => {
    const trades = [0, 1, 2].map((i) =>
      trade({ tid: i + 1, ts: BASE_TS + i * 60_000 })
    )
    const drafts = evaluateTradeAlerts(trades, [trades[2]], options())
    const repeat = drafts.find((draft) => draft.type === "repeat_trades")
    expect(repeat).toBeDefined()
    expect(repeat?.data).toMatchObject({ count: 3 })
  })

  it("does not count trades outside the window or on other sides", () => {
    const trades = [
      trade({ tid: 1, ts: BASE_TS - 11 * 60_000 }),
      trade({ tid: 2, ts: BASE_TS - 60_000, side: "sell" }),
      trade({ tid: 3, ts: BASE_TS }),
    ]
    const drafts = evaluateTradeAlerts(trades, [trades[2]], options())
    expect(
      drafts.find((draft) => draft.type === "repeat_trades")
    ).toBeUndefined()
  })
})

describe("coordinated_trades rule", () => {
  it("alerts when 3 distinct wallets buy the same coin at $100k+ within 15 minutes", () => {
    const wallets = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ]
    const trades = wallets.map((buyer, i) =>
      trade({ tid: i + 1, ts: BASE_TS + i * 60_000, buyer, notional: 120_000 })
    )
    const drafts = evaluateTradeAlerts(trades, [trades[2]], options())
    const coordinated = drafts.find(
      (draft) => draft.type === "coordinated_trades"
    )
    expect(coordinated).toBeDefined()
    expect(coordinated?.title).toContain("3 whales")
  })

  it("requires each wallet to clear the per-trade notional floor", () => {
    const wallets = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ]
    const trades = wallets.map((buyer, i) =>
      trade({ tid: i + 1, ts: BASE_TS + i * 60_000, buyer, notional: 90_000 })
    )
    const drafts = evaluateTradeAlerts(trades, [trades[2]], options())
    expect(
      drafts.find((draft) => draft.type === "coordinated_trades")
    ).toBeUndefined()
  })

  it("counts wallets, not trades", () => {
    const sameBuyer = [0, 1, 2].map((i) =>
      trade({ tid: i + 1, ts: BASE_TS + i * 60_000, notional: 150_000 })
    )
    const drafts = evaluateTradeAlerts(sameBuyer, [sameBuyer[2]], options())
    expect(
      drafts.find((draft) => draft.type === "coordinated_trades")
    ).toBeUndefined()
  })
})

describe("dedupe keys", () => {
  it("produces stable keys so re-evaluation cannot double-alert", () => {
    const big = trade({ tid: 42, notional: 300_000 })
    const first = evaluateTradeAlerts([big], [big], options())
    const second = evaluateTradeAlerts([big], [big], options())
    expect(first[0]?.dedupeKey).toBe(second[0]?.dedupeKey)
    expect(first[0]?.dedupeKey).toBe("whale_trade:42")
  })
})
