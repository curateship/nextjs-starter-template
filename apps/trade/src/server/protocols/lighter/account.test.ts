import { describe, expect, it } from "vitest"

import {
  toLighterAccountFigures,
  toLighterPortfolio,
} from "@/server/protocols/lighter/account"

/**
 * A trimmed copy of a real Lighter mainnet account, read 26 Aug 2026. The
 * figures below are that account's own, so the arithmetic here is checked
 * against what Lighter itself reported rather than against invented numbers.
 */
const ACCOUNT = {
  account_index: 5,
  collateral: "3.871385",
  available_balance: "2.771356",
  total_asset_value: 3.708185,
  cross_initial_margin_requirement: "0.936829",
  positions: [
    {
      market_id: 1,
      symbol: "BTC",
      initial_margin_fraction: "2.00",
      sign: 1,
      position: "0.00060",
      avg_entry_price: "78341.1",
      position_value: "46.84146",
      unrealized_pnl: "-0.1632",
      realized_pnl: "0.000000",
      liquidation_price: "72761.93488529015",
      margin_mode: 0,
      allocated_margin: "0.000000",
    },
  ],
}

describe("a Lighter account", () => {
  it("reads the figures the wallet card shows", () => {
    const figures = toLighterAccountFigures(ACCOUNT)
    expect(figures?.equity).toBeCloseTo(3.708185, 6)
    expect(figures?.free).toBeCloseTo(2.771356, 6)
    expect(figures?.openProfit).toBeCloseTo(-0.1632, 6)
    // Money in trades came to Lighter's own stated cross margin requirement
    // of 0.936829 when this account was read.
    expect(figures?.inTrades).toBeCloseTo(0.936829, 6)
  })

  it("never reports a negative amount held in trades", () => {
    // Free cash above the account's worth would otherwise show as a negative
    // figure on the card, which reads as a debt rather than as rounding.
    const figures = toLighterAccountFigures({
      ...ACCOUNT,
      total_asset_value: 1,
      available_balance: "2",
      positions: [],
    })
    expect(figures?.inTrades).toBe(0)
  })

  it("signs the position from Lighter's own direction flag", () => {
    const long = toLighterPortfolio(ACCOUNT).positions[0]
    expect(long.marketId).toBe("BTC")
    expect(long.szi).toBeCloseTo(0.0006, 8)
    expect(long.entryPx).toBeCloseTo(78_341.1, 4)
    expect(long.liquidationPx).toBeCloseTo(72_761.93, 2)

    const short = toLighterPortfolio({
      ...ACCOUNT,
      positions: [{ ...ACCOUNT.positions[0], sign: -1 }],
    }).positions[0]
    expect(short.szi).toBeCloseTo(-0.0006, 8)
  })

  it("turns Lighter's margin percent into leverage", () => {
    // 2.00 percent of the position's value is fifty times leverage.
    expect(toLighterPortfolio(ACCOUNT).positions[0].leverage).toBe(50)
    const gentler = toLighterPortfolio({
      ...ACCOUNT,
      positions: [
        { ...ACCOUNT.positions[0], initial_margin_fraction: "20.00" },
      ],
    })
    expect(gentler.positions[0].leverage).toBe(5)
  })

  it("works out a cross position's margin, which Lighter leaves at zero", () => {
    // Lighter fills allocated_margin in for an isolated position only. For a
    // cross one it states the percent instead, and 2% of $46.84 is $0.94 —
    // the same figure Lighter reported account-wide.
    expect(toLighterPortfolio(ACCOUNT).positions[0].marginUsed).toBeCloseTo(
      0.936829,
      5
    )
    const isolated = toLighterPortfolio({
      ...ACCOUNT,
      positions: [
        { ...ACCOUNT.positions[0], allocated_margin: "12.5", margin_mode: 1 },
      ],
    })
    expect(isolated.positions[0].marginUsed).toBe(12.5)
  })

  it("leaves out a closed position and an unreadable row", () => {
    const portfolio = toLighterPortfolio({
      ...ACCOUNT,
      positions: [
        { ...ACCOUNT.positions[0], position: "0" },
        { nonsense: true },
      ],
    })
    expect(portfolio.positions).toEqual([])
  })

  it("claims no stop, target or waiting order it cannot yet place", () => {
    const position = toLighterPortfolio(ACCOUNT).positions[0]
    expect(position.slPx).toBeNull()
    expect(position.tpPx).toBeNull()
    expect(position.targets).toEqual([])
    expect(position.protectionOrderIds).toEqual([])
    expect(toLighterPortfolio(ACCOUNT).orders).toEqual([])
  })

  it("says nothing rather than guessing at an unreadable account", () => {
    expect(toLighterAccountFigures(null)).toBeNull()
    expect(toLighterAccountFigures({ positions: [] })).toBeNull()
  })

  it("blanks a liquidation price Lighter does not state", () => {
    const portfolio = toLighterPortfolio({
      ...ACCOUNT,
      positions: [{ ...ACCOUNT.positions[0], liquidation_price: "0" }],
    })
    expect(portfolio.positions[0].liquidationPx).toBeNull()
  })
})
