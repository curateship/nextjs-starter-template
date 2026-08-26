import { describe, expect, it } from "vitest"

import { toLighterFill } from "@/server/protocols/lighter/fills"

/**
 * A real Lighter trade, trimmed, read from its own history on 26 Aug 2026.
 * Two accounts are in every row, so the same row is a buy for one and a sell
 * for the other — which is the whole difficulty this file exists to handle.
 */
const TRADE = {
  trade_id_str: "28595660658",
  type: "trade",
  market_id: 1,
  size: "0.00005",
  price: "78768.7",
  timestamp: 1_787_779_600_203,
  ask_account_id: 270_812,
  bid_account_id: 326_678,
  ask_client_id_str: "630111692350",
  bid_client_id_str: "0",
  is_maker_ask: true,
  taker_fee: 100,
  maker_fee: 28,
  ask_account_pnl: "1.25",
  bid_account_pnl: "-0.40",
  ask_position_size_before: "0.02700",
  maker_position_size_before: "0.58065",
  taker_position_size_before: "0.02700",
}

describe("reading one Lighter trade as this wallet's fill", () => {
  it("calls it a sell for the account on the ask side", () => {
    const fill = toLighterFill(TRADE, 270_812, "BTC")
    expect(fill?.side).toBe("sell")
    expect(fill?.marketId).toBe("BTC")
    expect(fill?.px).toBeCloseTo(78_768.7, 4)
    expect(fill?.sz).toBeCloseTo(0.00005, 8)
    expect(fill?.at).toBe(1_787_779_600_203)
  })

  it("calls the same trade a buy for the account on the bid side", () => {
    // One row, two accounts, opposite answers. Getting this backwards would
    // put every trade on the wrong side of the Journal.
    expect(toLighterFill(TRADE, 326_678, "BTC")?.side).toBe("buy")
  })

  it("ignores a trade neither side of which is this wallet", () => {
    expect(toLighterFill(TRADE, 999_999, "BTC")).toBeNull()
  })

  it("charges the maker fee to the side that was resting", () => {
    // `is_maker_ask` is true here, so the ask rested. Lighter states money in
    // millionths of a dollar: 28 is $0.000028 and 100 is $0.0001.
    expect(toLighterFill(TRADE, 270_812, "BTC")?.fee).toBeCloseTo(0.000028, 9)
    expect(toLighterFill(TRADE, 326_678, "BTC")?.fee).toBeCloseTo(0.0001, 9)
  })

  it("charges the taker fee when Lighter does not say who rested", () => {
    // The taker fee is the larger, so assuming it can only overstate what was
    // charged. Flattering the result is the failure that matters.
    const noSide = { ...TRADE, is_maker_ask: undefined }
    expect(toLighterFill(noSide, 270_812, "BTC")?.fee).toBeCloseTo(0.0001, 9)
  })

  it("takes the money banked from Lighter, for this wallet's side", () => {
    // Never worked out from prices here: the venue's own figure is the one
    // the account will actually show.
    expect(toLighterFill(TRADE, 270_812, "BTC")?.closedPnl).toBeCloseTo(1.25, 6)
    expect(toLighterFill(TRADE, 326_678, "BTC")?.closedPnl).toBeCloseTo(-0.4, 6)
  })

  it("keeps the app's own order number, and drops Lighter's zero", () => {
    // Lighter writes 0 where an order carried no id of the app's own, and a
    // zero would read as a real order number the Journal could never match.
    expect(toLighterFill(TRADE, 270_812, "BTC")?.orderId).toBe("630111692350")
    expect(toLighterFill(TRADE, 326_678, "BTC")?.orderId).toBe("")
  })

  it("says whether the fill opened or closed", () => {
    // The ask rested holding 0.58065 long, so selling shrank it.
    expect(toLighterFill(TRADE, 270_812, "BTC")?.dir).toBe("Close Long")
    // Buying with nothing held opens.
    const fresh = { ...TRADE, taker_position_size_before: "0" }
    expect(toLighterFill(fresh, 326_678, "BTC")?.dir).toBe("Open Long")
  })

  it("marks anything that is not an ordinary trade as a liquidation", () => {
    expect(toLighterFill(TRADE, 270_812, "BTC")?.liquidation).toBe(false)
    expect(
      toLighterFill({ ...TRADE, type: "liquidation" }, 270_812, "BTC")
        ?.liquidation
    ).toBe(true)
  })

  it("refuses a row it cannot read rather than inventing one", () => {
    expect(toLighterFill(null, 270_812, "BTC")).toBeNull()
    expect(toLighterFill({ ...TRADE, price: "nonsense" }, 270_812, "BTC")).toBeNull()
  })
})
