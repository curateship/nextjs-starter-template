import { describe, expect, it } from "vitest"

import {
  buildTradingOverviewEquity,
  isTradingOverviewWallet,
  moneyForOverviewFill,
  tradingOverviewWindowStart,
  tradingOverviewWalletPerformance,
} from "./overview"

describe("trading overview money", () => {
  it("uses live mainnet wallets and excludes every kind of practice money", () => {
    expect(isTradingOverviewWallet({ kind: "live", network: "mainnet" })).toBe(
      true
    )
    expect(isTradingOverviewWallet({ kind: "live", network: "testnet" })).toBe(
      false
    )
    expect(isTradingOverviewWallet({ kind: "paper", network: "mainnet" })).toBe(
      false
    )
  })

  it("leaves a KuCoin partial sale unpriced", () => {
    expect(
      moneyForOverviewFill({
        protocol: "kucoin",
        side: "sell",
        closedPnl: 0,
        fee: 0.2,
      })
    ).toBeNull()
  })

  it("uses the venue's stated profit less its fee", () => {
    expect(
      moneyForOverviewFill({
        protocol: "phemex",
        side: "sell",
        closedPnl: 12,
        fee: 0.5,
      })
    ).toBe(11.5)
  })

  it("keeps deposits out of wallet performance", () => {
    expect(
      tradingOverviewWalletPerformance("wallet-1", 11.4, [
        { walletId: "wallet-1", money: 500, at: 99 },
        { walletId: "wallet-1", money: 2.5, at: 100 },
        { walletId: "wallet-1", money: null, at: 101 },
        { walletId: "wallet-2", money: 900, at: 101 },
      ], 100)
    ).toEqual({
      settled: 2.5,
      open: 11.4,
      madeOrLost: 13.9,
    })
  })

  it("starts at midnight yesterday in Toronto", () => {
    expect(
      tradingOverviewWindowStart(new Date("2026-08-21T16:00:00.000Z"))
    ).toBe(new Date("2026-08-20T04:00:00.000Z").getTime())
  })

  it("builds one line from all opening balances and recorded fills", () => {
    expect(
      buildTradingOverviewEquity(
        [{ startingBalance: 100 }, { startingBalance: 50 }],
        [
          { at: 20, fee: 1, money: 9 },
          { at: 10, fee: 0.5, money: null },
        ]
      )
    ).toEqual([
      { at: 9, money: 150 },
      { at: 10, money: 149.5 },
      { at: 20, money: 158.5 },
    ])
  })
})
