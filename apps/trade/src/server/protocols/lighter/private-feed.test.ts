import { afterEach, describe, expect, it } from "vitest"

import {
  toLighterAccountFigures,
  toLighterPortfolio,
} from "@/server/protocols/lighter/account"
import {
  closeLighterPrivateFeeds,
  lighterAccountShape,
  lighterFillsNeedRecovery,
  lighterPositionsFromFrame,
  lighterStatsFromFrame,
  markLighterFillsAttempted,
  markLighterFillsReconciled,
} from "@/server/protocols/lighter/private-feed"
import { lighterMarginFraction } from "@/server/protocols/lighter/signer"

/**
 * Both frames below were captured from Lighter's live socket on 26 Aug 2026,
 * on `wss://mainnet.zklighter.elliot.ai/stream?readonly=true`, and are
 * trimmed only by dropping fields nothing reads.
 *
 * **What these pin.** The socket replaced a REST poll that was spending 46 of
 * Lighter's sixty requests a minute. A socket that reads a position or a
 * balance even slightly differently from the REST path it replaced would put
 * a wrong number on a screen about real money, and would do it quietly,
 * because both paths look healthy. So the test is not "does it parse" — it is
 * "does the pushed frame come out of the SAME converters with the same
 * answer".
 */

// The hubs live on `globalThis` so a reload cannot orphan a live socket, which
// means one test file's state would otherwise outlive it. Same reason Aster's
// user-stream test closes its own.
afterEach(() => {
  closeLighterPrivateFeeds()
})

const ACCOUNT_ALL = {
  type: "subscribed/account_all",
  channel: "account_all:337499",
  account: 337499,
  // Keyed by market id, not a list. Reading it as an array was the first
  // thing that had to be right.
  positions: {
    "0": {
      market_id: 0,
      symbol: "ETH",
      initial_margin_fraction: "5.00",
      sign: 1,
      position: "0.0105",
      avg_entry_price: "2498.11",
      position_value: "26.199915",
      unrealized_pnl: "-0.030240",
      realized_pnl: "0.000000",
      liquidation_price: "0",
      margin_mode: 0,
      allocated_margin: "0.000000",
    },
    "15": {
      market_id: 15,
      symbol: "PUMP",
      initial_margin_fraction: "20.00",
      sign: -1,
      position: "8151",
      avg_entry_price: "0.004900",
      position_value: "39.939900",
      unrealized_pnl: "0.831402",
      liquidation_price: "0.008120",
      margin_mode: 0,
      allocated_margin: "0.000000",
    },
  },
  trades: {},
}

const USER_STATS = {
  type: "subscribed/user_stats",
  channel: "user_stats:337499",
  stats: {
    collateral: "1437.659937",
    portfolio_value: "1437.627192",
    available_balance: "1433.050408",
    leverage: "0.06",
    margin_usage: "0.32",
    buying_power: "0",
  },
}

describe("a Lighter account arriving over the socket", () => {
  it("reads the positions map as a list", () => {
    const positions = lighterPositionsFromFrame(ACCOUNT_ALL)
    expect(positions).toHaveLength(2)
    // An object keyed by market id must never be read as an empty array.
    expect(positions?.map((one) => (one as { symbol: string }).symbol)).toEqual([
      "ETH",
      "PUMP",
    ])
  })

  it("hands the same positions the REST reader would have given", () => {
    const account = lighterAccountShape(
      337499,
      lighterPositionsFromFrame(ACCOUNT_ALL) ?? [],
      lighterStatsFromFrame(USER_STATS)
    )
    const portfolio = toLighterPortfolio(account)
    expect(portfolio.positions).toHaveLength(2)

    const pump = portfolio.positions.find((one) => one.marketId === "PUMP")
    // Short, and the size Lighter states is unsigned — the sign is its own
    // field, and losing it turns a short into a long on the screen.
    expect(pump?.szi).toBe(-8151)
    expect(pump?.entryPx).toBe(0.0049)
    // "20.00" percent of the position's value is 5x, not 20x.
    expect(pump?.leverage).toBe(5)
    expect(pump?.liquidationPx).toBe(0.00812)

    const eth = portfolio.positions.find((one) => one.marketId === "ETH")
    expect(eth?.szi).toBe(0.0105)
    // "5.00" percent is 20x.
    expect(eth?.leverage).toBe(20)
    // A zero liquidation price is "no answer", never a real price of $0.
    expect(eth?.liquidationPx).toBeNull()
  })

  it("takes the money figures from user_stats, which account_all lacks", () => {
    const account = lighterAccountShape(
      337499,
      lighterPositionsFromFrame(ACCOUNT_ALL) ?? [],
      lighterStatsFromFrame(USER_STATS)
    )
    const figures = toLighterAccountFigures(account)
    expect(figures?.equity).toBeCloseTo(1437.627192, 6)
    expect(figures?.free).toBeCloseTo(1433.050408, 6)
    // Lighter names the same number `portfolio_value` on the socket and
    // `total_asset_value` over REST. Reading the wrong one leaves equity at
    // zero, which reads as an emptied account.
    expect(figures?.equity).not.toBe(0)
    expect(figures?.openProfit).toBeCloseTo(0.801162, 6)
  })

  it("still answers when the stats frame has not arrived yet", () => {
    // A half-open line must not invent money. No stats means no figures,
    // and the caller falls back to REST rather than showing zero.
    const account = lighterAccountShape(
      337499,
      lighterPositionsFromFrame(ACCOUNT_ALL) ?? [],
      null
    )
    const figures = toLighterAccountFigures(account)
    expect(figures?.equity).toBe(0)
    expect(figures?.free).toBe(0)
    // The positions are still real, and still read.
    expect(toLighterPortfolio(account).positions).toHaveLength(2)
  })

  it("refuses a frame that is not an account at all", () => {
    expect(lighterPositionsFromFrame({ type: "connected" })).toBeNull()
    expect(lighterPositionsFromFrame(null)).toBeNull()
    expect(lighterStatsFromFrame({ channel: "user_stats:1" })).toBeNull()
  })
})

describe("the Journal's safety net", () => {
  it("reads an address it has never seen as needing recovery", () => {
    // The safe answer: recovery reads Lighter's own trade history. Saying
    // "no recovery needed" about an account nothing knows would leave the
    // Journal permanently short of the fills it missed.
    expect(
      lighterFillsNeedRecovery(
        "mainnet",
        "0x0000000000000000000000000000000000000001"
      )
    ).toBe(true)
  })

  it("does not ask again straight away, even knowing nothing about the wallet", () => {
    // The floor has to hold BEFORE the account number is known. It used to
    // live on the account, so a wallet whose lookup was failing had none and
    // answered "recover" every time — and that answer takes the sweep off its
    // own thirty-second throttle, so it read on every four-second poll,
    // exactly when Lighter was already refusing things.
    const address = "0x0000000000000000000000000000000000000002"
    expect(lighterFillsNeedRecovery("mainnet", address)).toBe(true)
    markLighterFillsReconciled("mainnet", address)
    expect(lighterFillsNeedRecovery("mainnet", address)).toBe(false)
  })

  it("waits a minute after a refused read before trying again", () => {
    const address = "0x0000000000000000000000000000000000000005"
    const other = "0x0000000000000000000000000000000000000006"
    markLighterFillsAttempted("mainnet", address, 1_000)

    expect(lighterFillsNeedRecovery("mainnet", address, 60_999)).toBe(false)
    expect(lighterFillsNeedRecovery("mainnet", other, 60_999)).toBe(true)
    expect(lighterFillsNeedRecovery("mainnet", address, 61_000)).toBe(true)
  })

  it("keeps one wallet's answer away from another's", () => {
    const mine = "0x0000000000000000000000000000000000000003"
    const theirs = "0x0000000000000000000000000000000000000004"
    markLighterFillsReconciled("mainnet", mine)
    expect(lighterFillsNeedRecovery("mainnet", mine)).toBe(false)
    expect(lighterFillsNeedRecovery("mainnet", theirs)).toBe(true)
  })
})

describe("leverage in Lighter's own units", () => {
  it("counts hundredths of a percent, like the market catalogue", () => {
    // The catalogue states 200 for a market that allows 50x, and this
    // transaction takes the same units. A position states "2.00" instead —
    // a plain percent — and mixing the two sends a leverage a hundred times
    // off, on real money.
    expect(lighterMarginFraction(50)).toBe(200)
    expect(lighterMarginFraction(20)).toBe(500)
    expect(lighterMarginFraction(5)).toBe(2000)
    expect(lighterMarginFraction(1)).toBe(10_000)
  })

  it("refuses a leverage it cannot say", () => {
    expect(() => lighterMarginFraction(0)).toThrow("LIGHTER_LEVERAGE_INVALID")
    expect(() => lighterMarginFraction(-3)).toThrow("LIGHTER_LEVERAGE_INVALID")
    // 20,000x rounds to one whole unit, and one unit IS 10,000x — half what
    // was asked, and it would have been sent without a word. Caught by this
    // test on the day it was written.
    expect(() => lighterMarginFraction(20_000)).toThrow(
      "LIGHTER_LEVERAGE_INVALID"
    )
    // Ordinary leverages that do not divide cleanly still go through: 3x is
    // 3,333 units, which reads back as 3.0003x.
    expect(lighterMarginFraction(3)).toBe(3333)
    expect(lighterMarginFraction(7)).toBe(1429)
  })
})
