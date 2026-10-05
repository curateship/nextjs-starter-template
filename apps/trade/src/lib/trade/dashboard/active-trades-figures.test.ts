import { describe, expect, it } from "vitest"

import { activeTradesFigures } from "./active-trades"
import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"

/**
 * The two figures on the header button.
 *
 * What matters is when they refuse to be said. A total missing a venue is not
 * this account's total, so it is never drawn as one — the button shows the
 * last complete pair instead, remembered in `trade_header_figures`.
 */

function snapshot(over: Partial<ActiveTradesSnapshot>): ActiveTradesSnapshot {
  return {
    activeTrades: [],
    activeTradesUnavailable: [],
    watchingOrders: [],
    watchingUnavailable: [],
    ...over,
  } as ActiveTradesSnapshot
}

const trade = (value: number, profit: number) =>
  ({ value, profit, profitShare: 0 }) as never

describe("the header button's figures", () => {
  it("adds up the trades when every exchange answered", () => {
    expect(
      activeTradesFigures(snapshot({ activeTrades: [trade(1000, 16), trade(250, -4)] }))
    ).toEqual({ value: "$1,250", profit: "+$12", profitValue: 12 })
  })

  it("says zero rather than nothing when there are no trades", () => {
    // An account with nothing open has a real answer, and it is $0 — not the
    // dashes that mean "we could not read this".
    expect(activeTradesFigures(snapshot({}))).toEqual({
      value: "$0",
      profit: "$0",
      profitValue: 0,
    })
  })

  it("refuses a total while an exchange has not answered", () => {
    // The one that matters. A sum missing a venue would read as the whole
    // account's money, so there is no figure at all and the button falls back
    // to the last complete pair it was told.
    expect(
      activeTradesFigures(
        snapshot({
          activeTrades: [trade(1000, 16)],
          activeTradesUnavailable: ["kucoin"],
        })
      )
    ).toBeNull()
  })
})
