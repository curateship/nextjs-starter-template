import { describe, expect, it } from "vitest"

import {
  buildWalletReport,
  getWalletCheckErrorMessage,
  readWalletAddress,
  walletAddressProblem,
  type WalletCheckRead,
} from "@/lib/free-tools/wallet-checker"
import type { WalletOrderFill } from "@/lib/protocols/contracts"
import { bucketDays } from "@/lib/trade/pnl/day-buckets"
import { dayStart } from "@/lib/trade/pnl/periods"
import { publicFigures, windowStart } from "@/lib/trade/public-profile/figures"

const ADDRESS = "0x3f0000000000000000000000000000000000ea91"
// Noon in Toronto on 24 Sep 2026.
const NOW = dayStart("2026-09-24") + 12 * 3_600_000
const DAY = 86_400_000

describe("checking a typed address", () => {
  it("accepts 0x and forty hex digits, in any case, with spaces around it", () => {
    expect(readWalletAddress(`  ${ADDRESS.toUpperCase()} `)).toBe(ADDRESS)
    expect(walletAddressProblem(` ${ADDRESS} `)).toBeNull()
  })

  it("refuses anything else, and says what a wallet address looks like", () => {
    for (const wrong of [
      "",
      "   ",
      "sam",
      ADDRESS.slice(0, -1),
      `${ADDRESS}0`,
      ADDRESS.replace("a91", "z91"),
      ADDRESS.slice(2),
      ADDRESS.replace("0x", "1x"),
    ]) {
      expect(readWalletAddress(wrong), wrong).toBeNull()
      expect(walletAddressProblem(wrong), wrong).not.toBeNull()
    }
    expect(walletAddressProblem("sam")).toContain("0x")
    expect(walletAddressProblem("")).toBe(
      "Paste a Hyperliquid wallet address."
    )
  })
})

describe("what a failed check says", () => {
  it("names the visitor's own limit and the whole page's limit apart", () => {
    expect(getWalletCheckErrorMessage(new Error("RATE_LIMITED"))).toContain(
      "5 wallets a minute"
    )
    expect(
      getWalletCheckErrorMessage(new Error("WALLET_CHECK_BUSY"))
    ).toContain("Too many wallets are being checked")
  })

  it("says the exchange did not answer, rather than printing its error", () => {
    expect(
      getWalletCheckErrorMessage(new Error("WALLET_CHECK_UNAVAILABLE: 429"))
    ).toBe("Hyperliquid did not answer. Try again in a minute.")
  })
})

let nextFill = 0

/** One fill, with only the fields the report reads spelled out. */
function fill(
  coin: string,
  side: "buy" | "sell",
  at: number,
  extra: Partial<WalletOrderFill> = {}
): WalletOrderFill {
  nextFill += 1
  return {
    fillId: `f${nextFill}`,
    orderId: `o${nextFill}`,
    marketId: coin,
    side,
    px: 100,
    sz: 1,
    at,
    closedPnl: 0,
    fee: 1,
    dir: side === "buy" ? "Open Long" : "Close Long",
    liquidation: false,
    ...extra,
  }
}

function read(over: Partial<WalletCheckRead> = {}): WalletCheckRead {
  return {
    address: ADDRESS,
    fills: [],
    capped: false,
    openPositions: 0,
    profileHandle: null,
    profitPerSale: true,
    now: NOW,
    ...over,
  }
}

describe("the report's figures", () => {
  // Two finished trades in the last 30 days and one older one: a $50 winner
  // on BTC, a $200 loser on ETH, and a $500 winner 40 days back.
  const fills: WalletOrderFill[] = [
    fill("BTC", "buy", NOW - 40 * DAY),
    fill("BTC", "sell", NOW - 40 * DAY + 1, { closedPnl: 502 }),
    fill("BTC", "buy", NOW - 20 * DAY),
    fill("BTC", "sell", NOW - 20 * DAY + 1, { closedPnl: 52 }),
    fill("ETH", "buy", NOW - 10 * DAY),
    fill("ETH", "sell", NOW - 10 * DAY + 1, { closedPnl: -198 }),
  ]
  const report = buildWalletReport(read({ fills }))

  it("counts money as the exchange's figure less the fee it charged", () => {
    expect(report.figures.made.all.money).toBe(502 + 52 - 198 - 6)
    expect(report.figures.made.all.fees).toBe(6)
    expect(report.figures.made["30d"].money).toBe(52 - 198 - 4)
    expect(report.figures.made["30d"].fees).toBe(4)
  })

  it("agrees with the P&L page's month grid over the same 30 days", () => {
    const money = fills.map((one) => ({
      at: one.at,
      money: one.closedPnl - one.fee,
      fee: one.fee,
    }))
    const trades = [
      { closedAt: NOW - 40 * DAY + 1, pnl: 500 },
      { closedAt: NOW - 20 * DAY + 1, pnl: 50 },
      { closedAt: NOW - 10 * DAY + 1, pnl: -200 },
    ]
    const tiles = [...bucketDays(money, trades, windowStart(30, NOW)).values()]
    expect(report.figures.made["30d"].money).toBe(
      tiles.reduce((sum, day) => sum + day.money, 0)
    )
    expect(report.figures).toEqual(publicFigures(money, trades, NOW))
  })

  it("counts finished trades and how many of them made money", () => {
    expect(report.figures.closedTrades).toBe(3)
    expect(report.figures.wonTrades).toBe(2)
    expect(report.figures.wonPer100).toBe(67)
  })

  it("names the single worst trade, its coin and the day it closed", () => {
    expect(report.worstTrade).toEqual({
      symbol: "ETH",
      pnl: -200,
      closedAt: NOW - 10 * DAY + 1,
    })
  })

  it("says the history starts at the earliest fill the exchange returned", () => {
    expect(report.historyStart).toBe(NOW - 40 * DAY)
    expect(report.historyCapped).toBe(false)
    expect(report.thirtyDaysPartial).toBe(false)
  })
})

describe("a wallet with nothing in it", () => {
  const report = buildWalletReport(read())

  it("has no history and no worst trade rather than a zero that reads as one", () => {
    expect(report.historyStart).toBeNull()
    expect(report.worstTrade).toBeNull()
    expect(report.figures.wonPer100).toBeNull()
    expect(report.figures.closedTrades).toBe(0)
    expect(report.figures.made.all.money).toBe(0)
  })
})

describe("history the exchange cut short", () => {
  it("says the 30 days are only partly covered when the cut falls inside them", () => {
    const inside = buildWalletReport(
      read({ capped: true, fills: [fill("BTC", "buy", NOW - 3 * DAY)] })
    )
    expect(inside.historyCapped).toBe(true)
    expect(inside.thirtyDaysPartial).toBe(true)
  })

  it("leaves the 30 days whole when the cut is older than the window", () => {
    const older = buildWalletReport(
      read({ capped: true, fills: [fill("BTC", "buy", NOW - 90 * DAY)] })
    )
    expect(older.historyCapped).toBe(true)
    expect(older.thirtyDaysPartial).toBe(false)
  })

  it("is never partial when the exchange gave everything it had", () => {
    const whole = buildWalletReport(
      read({ capped: false, fills: [fill("BTC", "buy", NOW - 3 * DAY)] })
    )
    expect(whole.thirtyDaysPartial).toBe(false)
  })
})

describe("what the report carries through", () => {
  it("keeps the open positions, the profile handle and the read time", () => {
    const report = buildWalletReport(
      read({ openPositions: 2, profileHandle: "sam" })
    )
    expect(report.openPositions).toBe(2)
    expect(report.profileHandle).toBe("sam")
    expect(report.readAt).toBe(NOW)
    expect(report.address).toBe(ADDRESS)
  })
})
